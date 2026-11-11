import { useState } from "react";
import { AlertTriangle, Loader2, Search } from "lucide-react";
import { useEstadoTela } from "@/lib/navegacao";
import { useLogisticaRemessasAndamento, type RemessaRow } from "@/hooks/logistica/useLogisticaRemessas";
import { compararAndamento, situacaoAndamento, type SituacaoAndamento } from "@/lib/logistica/entregasAndamento";
import { brl, ddmm } from "@/lib/logistica/formato";
import { cn } from "@/lib/utils";
import { rawMessage } from "@/lib/format-error";
import { KpiPill } from "@/components/shared/KpiPill";
import { ordenarPor, SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { RemessaDetalheDrawer } from "./RemessaDetalheDrawer";

const ROTULOS: Record<SituacaoAndamento, string> = {
  ocorrencia: "Com ocorrência", atrasada: "Atrasada", parada: "Parada", sem_rastreio: "Sem rastreio", em_transito: "Em trânsito",
};
const CARDS = [
  { k: "todas", l: "Abertas" }, { k: "ocorrencia", l: "Com ocorrência" }, { k: "atrasada", l: "Atrasadas" },
  { k: "parada", l: "Paradas" }, { k: "em_transito", l: "Em trânsito" }, { k: "sem_rastreio", l: "Sem rastreio" },
] as const;
type Col = "referencia" | "cliente" | "canal" | "destino" | "despacho" | "situacao" | "previsao" | "atraso" | "parado" | "ocorrencia" | "valor";
const situacaoRotulo = (r: RemessaRow) => situacaoAndamento(r) === "ocorrencia" ? r.estado_rotulo ?? ROTULOS.ocorrencia : ROTULOS[situacaoAndamento(r)];
const VALORES: Record<Col, (r: RemessaRow) => string | number | null> = {
  referencia: r => r.referencia, cliente: r => r.cliente, canal: r => r.canal,
  destino: r => r.cidade_destino == null && r.uf_destino == null ? null : `${r.cidade_destino ?? ""}/${r.uf_destino ?? ""}`,
  despacho: r => r.data_despacho, situacao: situacaoRotulo, previsao: r => r.previsao_entrega,
  atraso: r => r.atrasada === true ? r.dias_atraso : null, parado: r => r.dias_sem_movimento,
  ocorrencia: r => r.ultima_ocorrencia_texto, valor: r => r.valor_mercadoria,
};
const COLUNAS: { k: Col; l: string; direita?: boolean }[] = [
  { k: "referencia", l: "Referência" }, { k: "cliente", l: "Cliente" }, { k: "canal", l: "Canal" },
  { k: "destino", l: "Destino" }, { k: "despacho", l: "Despachado" }, { k: "situacao", l: "Situação" },
  { k: "previsao", l: "Previsão" }, { k: "atraso", l: "Atraso" }, { k: "parado", l: "Parado há" },
  { k: "ocorrencia", l: "Última ocorrência" }, { k: "valor", l: "Valor mercadoria", direita: true },
];
function Valor({ valor, texto }: { valor: unknown; texto?: string }) {
  return <span className={cn(valor == null && "text-muted-foreground/50")}>{valor == null ? "—" : texto ?? String(valor)}</span>;
}

export function EntregasAndamento({ transportadoraId, canal }: { transportadoraId: string | null; canal: "total" | "b2b" | "b2c" }) {
  const { data = [], isLoading, error, refetch } = useLogisticaRemessasAndamento({ transportadoraId, canal: canal === "total" ? null : canal });
  const [nav, setNav] = useEstadoTela({ situacao: "todas", busca: "", ordem: "", detalhe: "" }, { prefixo: "and", replaceKeys: ["busca"] });
  const [tentando, setTentando] = useState(false);
  const [coluna, direcao] = nav.ordem.split(":");
  const sort: SortState<Col> | null = COLUNAS.some(c => c.k === coluna) && (direcao === "asc" || direcao === "desc")
    ? { column: coluna as Col, direction: direcao } : null;
  const busca = nav.busca.trim().toLocaleLowerCase("pt-BR");
  const base = data.filter(r => !busca || [r.referencia, r.cliente, r.cidade_destino].some(v => v?.toLocaleLowerCase("pt-BR").includes(busca)));
  const contagens = Object.fromEntries(CARDS.map(c => [c.k, c.k === "todas" ? base.length : base.filter(r => situacaoAndamento(r) === c.k).length]));
  const filtro = CARDS.some(c => c.k === nav.situacao) ? nav.situacao : "todas";
  const filtradas = base.filter(r => filtro === "todas" || situacaoAndamento(r) === filtro).sort(compararAndamento);
  const linhas = ordenarPor(filtradas, sort, VALORES);
  async function tentar() {
    setTentando(true);
    try { await refetch(); } finally { setTentando(false); }
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      {CARDS.map(c => <KpiPill key={c.k} label={c.l} count={contagens[c.k]} active={filtro === c.k}
        color={(c.k === "ocorrencia" || c.k === "atrasada") && contagens[c.k] > 0 ? "amber" : c.k === "todas" ? "admin" : c.k === "em_transito" ? "blue" : "gray"}
        onClick={() => setNav({ situacao: filtro === c.k ? "todas" : c.k })} />)}
    </div>
    <div className="relative min-w-0">
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input placeholder="Buscar referência, cliente ou cidade…" value={nav.busca} onChange={e => setNav({ busca: e.target.value })} className="pl-8" />
    </div>
    {isLoading ? <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Carregando remessas…</div>
      : error ? <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
        <div className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" />Não foi possível carregar as remessas</div>
        <p className="text-sm">{rawMessage(error)}</p><Button size="sm" variant="outline" disabled={tentando} onClick={() => void tentar()}>Tentar de novo</Button>
      </div> : !linhas.length ? <div className="py-10 text-center text-sm text-muted-foreground">Nenhuma entrega em andamento.</div>
        : <div className="overflow-x-auto rounded-lg border bg-card"><Table className="text-xs">
          <TableHeader><TableRow>{COLUNAS.map(c => <SortableTableHead key={c.k} column={c.k} sort={sort}
            onSort={s => setNav({ ordem: s ? `${s.column}:${s.direction}` : "" })} align={c.direita ? "right" : "left"}>{c.l}</SortableTableHead>)}</TableRow></TableHeader>
          <TableBody>{linhas.map(r => {
            const situacao = situacaoAndamento(r);
            return <TableRow key={r.pedido_id ?? r.referencia} className="cursor-pointer" onClick={() => r.pedido_id && setNav({ detalhe: r.pedido_id })}>
              <TableCell className="whitespace-nowrap font-medium"><Valor valor={r.referencia} /></TableCell>
              <TableCell className="max-w-44 truncate" title={r.cliente ?? undefined}><Valor valor={r.cliente} /></TableCell>
              <TableCell><Badge variant="outline" className="text-[10px] uppercase">{r.canal}</Badge></TableCell>
              <TableCell className="whitespace-nowrap"><Valor valor={r.cidade_destino} />/<Valor valor={r.uf_destino} /></TableCell>
              <TableCell className="tabular-nums"><Valor valor={r.data_despacho} texto={ddmm(r.data_despacho)} /></TableCell>
              <TableCell><Badge variant="outline" className={cn("whitespace-nowrap text-[10px]", situacao === "ocorrencia" ? "border-destructive/40 bg-destructive/10 text-destructive" : situacao === "atrasada" ? "border-warning/40 bg-warning/10 text-warning" : "border-border")}>{situacaoRotulo(r)}</Badge></TableCell>
              <TableCell className="tabular-nums"><Valor valor={r.previsao_entrega} texto={ddmm(r.previsao_entrega)} /></TableCell>
              <TableCell className={cn("whitespace-nowrap tabular-nums", r.atrasada === true && r.dias_atraso != null && "text-warning")}><Valor valor={r.atrasada === true ? r.dias_atraso : null} texto={`${r.dias_atraso} d`} /></TableCell>
              <TableCell className="whitespace-nowrap tabular-nums"><Valor valor={r.dias_sem_movimento} texto={`${r.dias_sem_movimento} d`} /></TableCell>
              <TableCell className="max-w-52 truncate" title={r.ultima_ocorrencia_texto ?? undefined}><Valor valor={r.ultima_ocorrencia_texto} /></TableCell>
              <TableCell className="whitespace-nowrap text-right tabular-nums"><Valor valor={r.valor_mercadoria} texto={brl(r.valor_mercadoria)} /></TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></div>}
    <RemessaDetalheDrawer pedidoId={nav.detalhe || null} onClose={() => setNav({ detalhe: "" })} />
  </div>;
}