import { useEstadoTela, resolverAcao } from "@/lib/navegacao";
import type { SetStateAction } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { KpiPill } from "@/components/shared/KpiPill";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { useLogisticaRemessas, type RemessaRow } from "@/hooks/logistica/useLogisticaRemessas";
import { brl, ddmm, isoDiasAtras, ROTULO_FONTE_REMESSA } from "@/lib/logistica/formato";
import { RemessaDetalheDrawer } from "./RemessaDetalheDrawer";

type Status = "todas" | "transito" | "atencao" | "entregues" | "devolucao" | "sem_rastreio";
const EM_TRANSITO = new Set(["postado_coletado", "em_transito", "custodia_transferida", "etiqueta"]);
const PERIODOS = [{ v: 30, l: "30 dias" }, { v: 90, l: "90 dias" }, { v: 180, l: "180 dias" }, { v: 0, l: "Tudo" }];

const ehAtencao = (r: RemessaRow) => r.eh_problema || (r.dias_sem_movimento ?? 0) > 7;
const ehEntregue = (r: RemessaRow) => r.estado_canonico === "entregue";
const TESTE: Record<Status, (r: RemessaRow) => boolean> = {
  todas: () => true,
  transito: (r) => !!r.estado_canonico && EM_TRANSITO.has(r.estado_canonico),
  atencao: ehAtencao,
  entregues: ehEntregue,
  devolucao: (r) => r.estado_canonico === "devolucao",
  sem_rastreio: (r) => !r.estado_canonico,
};

type Col = "referencia" | "cliente" | "transportadora" | "canal" | "destino" | "despacho" | "estado" | "previsao"
  | "entregue" | "prazo" | "parado" | "receita" | "custo";
const VAL: Record<Col, (r: RemessaRow) => string | number | null> = {
  referencia: (r) => r.referencia, cliente: (r) => r.cliente, transportadora: (r) => r.transportadora, canal: (r) => r.canal,
  destino: (r) => `${r.uf_destino ?? ""}${r.cidade_destino ?? ""}`, despacho: (r) => r.data_despacho, estado: (r) => r.estado_rotulo,
  previsao: (r) => r.previsao_entrega, entregue: (r) => r.entregue_em, prazo: (r) => (r.no_prazo == null ? null : r.no_prazo ? 1 : 0),
  parado: (r) => (ehEntregue(r) ? null : r.dias_sem_movimento), receita: (r) => r.receita_frete, custo: (r) => r.custo_frete,
};

function estadoCls(r: RemessaRow) {
  if (!r.estado_canonico) return "border-border text-muted-foreground bg-muted/40";
  if (r.eh_problema) return "border-destructive/40 text-destructive bg-destructive/10";
  if (ehEntregue(r)) return "border-success/40 text-success bg-success/10";
  return "border-border";
}
function BadgeEstado({ r }: { r: RemessaRow }) {
  return <Badge variant="outline" className={cn("text-[10px]", estadoCls(r))}>{r.estado_canonico ? r.estado_rotulo ?? r.estado_canonico : "sem rastreio"}</Badge>;
}
function Parado({ r }: { r: RemessaRow }) {
  if (ehEntregue(r) || r.dias_sem_movimento == null) return null;
  const d = r.dias_sem_movimento;
  return <span className={cn("tabular-nums", d > 15 ? "text-destructive" : d > 7 && "text-warning")}>{d} d</span>;
}
function Prazo({ v }: { v: boolean | null }) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  return v ? <Check className="h-4 w-4 text-success" /> : <X className="h-4 w-4 text-destructive" />;
}
function Custo({ r }: { r: RemessaRow }) {
  return (
    <span className="inline-flex items-center gap-1 justify-end">
      <span className="tabular-nums">{brl(r.custo_frete)}</span>
      <Badge variant="outline" className="text-[10px]">{ROTULO_FONTE_REMESSA[r.custo_fonte] ?? "—"}</Badge>
    </span>
  );
}
const Ref = ({ r }: { r: RemessaRow }) =>
  r.pedido_id ? (
    <Link to={`/pedidos/${r.pedido_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{r.referencia}</Link>
  ) : <span>{r.referencia}</span>;

export function EntregasRemessas({ transportadoraId = null, canal = "total" }: { transportadoraId?: string | null; canal?: "total" | "b2b" | "b2c" }) {
  const [dias, setDias] = useState(90);
  const de = dias ? isoDiasAtras(dias) : null;
  const { data = [], isLoading, error, refetch } = useLogisticaRemessas({ transportadoraId, canal: canal === "total" ? null : canal, de });
  // TELA-LEMBRA-ONDE-EU-ESTAVA: filtros da lista na URL.
  const [nav, setNav] = useEstadoTela({ status: "todas", transp: null, busca: "", cobrado: false }, { prefixo: "en", replaceKeys: ["busca"] });
  const status = nav.status as Status; const setStatus = (v: SetStateAction<typeof status>) => setNav({ status: resolverAcao(v, status) as never });
  const transp = nav.transp as string | null; const setTransp = (v: SetStateAction<typeof transp>) => setNav({ transp: resolverAcao(v, transp) as never });
  const busca = nav.busca; const setBusca = (v: SetStateAction<typeof busca>) => setNav({ busca: resolverAcao(v, busca) as never });
  const soCobrado = nav.cobrado; const setSoCobrado = (v: SetStateAction<typeof soCobrado>) => setNav({ cobrado: resolverAcao(v, soCobrado) as never });
  const [sort, setSort] = useState<SortState<Col> | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const mobile = useIsMobile();

  const base = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return data.filter((r) => {
      if (transp && r.transportadora !== transp) return false;
      if (soCobrado && !(r.receita_frete > 0)) return false;
      if (q && ![r.referencia, r.cliente, r.cidade_destino].some((v) => (v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [data, transp, soCobrado, busca]);

  const contagem = useMemo(() => {
    const c = {} as Record<Status, number>;
    (Object.keys(TESTE) as Status[]).forEach((k) => (c[k] = base.filter(TESTE[k]).length));
    return c;
  }, [base]);

  const linhas = useMemo(() => {
    const l = base.filter(TESTE[status]);
    if (sort) {
      const f = VAL[sort.column];
      const d = sort.direction === "asc" ? 1 : -1;
      return l.sort((a, b) => {
        const va = f(a), vb = f(b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * d;
      });
    }
    return l.sort((a, b) => {
      const aa = ehAtencao(a) ? 1 : 0, ab = ehAtencao(b) ? 1 : 0;
      if (aa !== ab) return ab - aa;
      if (aa) {
        const du = (b.ordem_urgencia ?? 0) - (a.ordem_urgencia ?? 0);
        if (du) return du;
      }
      return (b.data_despacho ?? "").localeCompare(a.data_despacho ?? "");
    });
  }, [base, status, sort]);

  const transportadoras = useMemo(() => [...new Set(data.map((r) => r.transportadora))].sort(), [data]);

  const pills: { k: Status; l: string; c: "admin" | "amber" | "emerald" | "blue" | "gray" }[] = [
    { k: "todas", l: "Todas", c: "admin" }, { k: "transito", l: "Em trânsito", c: "blue" },
    { k: "atencao", l: "Atenção", c: "amber" }, { k: "entregues", l: "Entregues", c: "emerald" },
    { k: "devolucao", l: "Devolução", c: "gray" }, { k: "sem_rastreio", l: "Sem rastreio", c: "gray" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PERIODOS.map((p) => (
          <button key={p.v} onClick={() => setDias(p.v)}
            className={cn("rounded-full px-3 py-1 text-xs border", dias === p.v ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
            {p.l}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {pills.map((p) => (
          <KpiPill key={p.k} label={p.l} count={contagem[p.k] ?? 0} color={p.c} active={status === p.k}
            onClick={() => setStatus(p.k === status ? "todas" : p.k)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!transportadoraId && transportadoras.map((t) => (
          <button key={t} onClick={() => setTransp(transp === t ? null : t)}
            className={cn("rounded-full px-3 py-1 text-xs border", transp === t ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted")}>
            {t}
          </button>
        ))}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar referência, cliente ou cidade…" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={soCobrado} onCheckedChange={(v) => setSoCobrado(v === true)} /> só com frete cobrado
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando remessas…</div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> Não foi possível carregar as remessas</div>
          <p className="text-sm">{error instanceof Error ? error.message : String(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : !linhas.length ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">Nenhuma remessa no filtro.</div>
      ) : mobile ? (
        <div className="grid gap-2">
          {linhas.map((r, i) => (
            <button key={`${r.pedido_id}-${i}`} onClick={() => r.pedido_id && setAberto(r.pedido_id)} className="rounded-lg border bg-card p-3 text-left text-sm space-y-1">
              <div className="flex justify-between gap-2"><Ref r={r} /><BadgeEstado r={r} /></div>
              <div className="text-xs">{r.cliente ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{r.cidade_destino ?? "—"}/{r.uf_destino ?? "—"} · despachado {ddmm(r.data_despacho)}</div>
              <div className="text-xs flex justify-between"><span>Cobrado {brl(r.receita_frete)}</span><Custo r={r} /></div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead column="referencia" sort={sort} onSort={setSort}>Referência</SortableTableHead>
                <SortableTableHead column="cliente" sort={sort} onSort={setSort}>Cliente</SortableTableHead>
                {!transportadoraId && <SortableTableHead column="transportadora" sort={sort} onSort={setSort}>Transportadora</SortableTableHead>}
                <SortableTableHead column="canal" sort={sort} onSort={setSort}>Canal</SortableTableHead>
                <SortableTableHead column="destino" sort={sort} onSort={setSort}>Destino</SortableTableHead>
                <SortableTableHead column="despacho" sort={sort} onSort={setSort}>Despachado</SortableTableHead>
                <SortableTableHead column="estado" sort={sort} onSort={setSort}>Estado</SortableTableHead>
                <SortableTableHead column="previsao" sort={sort} onSort={setSort}>Previsão</SortableTableHead>
                <SortableTableHead column="entregue" sort={sort} onSort={setSort}>Entregue em</SortableTableHead>
                <SortableTableHead column="prazo" sort={sort} onSort={setSort}>Prazo</SortableTableHead>
                <SortableTableHead column="parado" sort={sort} onSort={setSort} align="right">Parado há</SortableTableHead>
                <TableHead>Última ocorrência</TableHead>
                <SortableTableHead column="receita" sort={sort} onSort={setSort} align="right">Frete cobrado</SortableTableHead>
                <SortableTableHead column="custo" sort={sort} onSort={setSort} align="right">Custo</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((r, i) => (
                <TableRow key={`${r.pedido_id}-${i}`} className="cursor-pointer" onClick={() => r.pedido_id && setAberto(r.pedido_id)}>
                  <TableCell className="font-medium whitespace-nowrap"><Ref r={r} /></TableCell>
                  <TableCell className="max-w-[180px] truncate">{r.cliente ?? "—"}</TableCell>
                  {!transportadoraId && <TableCell className="whitespace-nowrap">{r.transportadora}</TableCell>}
                  <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.canal}</Badge></TableCell>
                  <TableCell className="whitespace-nowrap">{r.cidade_destino ?? "—"}/{r.uf_destino ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{ddmm(r.data_despacho)}</TableCell>
                  <TableCell><BadgeEstado r={r} /></TableCell>
                  <TableCell className="tabular-nums">{ddmm(r.previsao_entrega)}</TableCell>
                  <TableCell className="tabular-nums">{ddmm(r.entregue_em)}</TableCell>
                  <TableCell><Prazo v={r.no_prazo} /></TableCell>
                  <TableCell className="text-right"><Parado r={r} /></TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs" title={r.ultima_ocorrencia_texto ?? undefined}>{r.ultima_ocorrencia_texto ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{brl(r.receita_frete)}</TableCell>
                  <TableCell className="text-right"><Custo r={r} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <RemessaDetalheDrawer pedidoId={aberto} onClose={() => setAberto(null)} />
    </div>
  );
}
