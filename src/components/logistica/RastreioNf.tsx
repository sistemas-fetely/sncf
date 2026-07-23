import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Package, Search, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { useRastreioNf, type RastreioNfRow } from "@/hooks/logistica/useRastreioNf";
import { statusBadge } from "./CardFrete";
import { SortableTableHead, ordenarPor, type SortState } from "@/components/shared/SortableTableHead";

type SortCol = "nf" | "transportadora" | "destinatario" | "status" | "previsao" | "entrega" | "valor";

const CLASSE_LABELS: Record<string, string> = {
  entregue: "Entregue",
  em_transito: "Em trânsito",
  coletado: "Coletado",
  atencao: "Atenção",
};

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function RastreioNf() {
  const { data = [], isLoading, error } = useRastreioNf();
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [filtroTransp, setFiltroTransp] = useState<string>("todas");
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<SortState<SortCol> | null>(null);

  const classesPresentes = useMemo(() => {
    const s = new Set<string>();
    for (const r of data) s.add(r.classe ?? "__null__");
    return Array.from(s);
  }, [data]);

  const transportadorasPresentes = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data) {
      if (r.transportadora_id) m.set(r.transportadora_id, r.transportadora_nome ?? "—");
    }
    return Array.from(m.entries());
  }, [data]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = data.filter((r) => {
      if (filtroTransp !== "todas" && r.transportadora_id !== filtroTransp) return false;
      if (filtroStatus === "devolucoes") {
        if (!r.eh_devolucao) return false;
      } else if (filtroStatus !== "todos") {
        const c = r.classe ?? "__null__";
        if (c !== filtroStatus) return false;
      }
      if (q) {
        const nf = (r.nf_numero ?? "").toLowerCase();
        const dest = (r.destinatario ?? "").toLowerCase();
        if (!nf.includes(q) && !dest.includes(q)) return false;
      }
      return true;
    });
    if (!sort) return base;
    const toTs = (s: string | null) => {
      if (!s) return null;
      const t = new Date(s).getTime();
      return isNaN(t) ? null : t;
    };
    return ordenarPor<RastreioNfRow, SortCol>(base, sort, {
      nf: (r) => r.nf_numero ?? null,
      transportadora: (r) => r.transportadora_nome ?? null,
      destinatario: (r) => r.destinatario ?? null,
      status: (r) => statusBadge(r.classe).label,
      previsao: (r) => toTs(r.previsao_entrega),
      entrega: (r) => toTs(r.data_entrega),
      valor: (r) => (r.valor_nf != null ? Number(r.valor_nf) : null),
    });
  }, [data, filtroStatus, filtroTransp, busca, sort]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando rastreios…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5" />
        <div>
          <div className="font-medium">Erro ao carregar rastreios</div>
          <div className="text-xs">{(error as Error).message}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div className="text-sm font-medium">Rastreio por NF</div>
          <Badge variant="outline" className="text-xs">{filtradas.length} de {data.length}</Badge>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="NF ou destinatário…"
            className="h-8 pl-7 w-56 text-xs"
          />
        </div>

        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {classesPresentes.map((c) => {
              const key = c;
              const label = c === "__null__" ? "Sem classificação" : (CLASSE_LABELS[c] ?? c);
              return <SelectItem key={key} value={key}>{label}</SelectItem>;
            })}
            <SelectItem value="devolucoes">Devoluções</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filtroTransp} onValueChange={setFiltroTransp}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Transportadora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas</SelectItem>
            {transportadorasPresentes.map(([id, nome]) => (
              <SelectItem key={id} value={id}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtradas.length === 0 ? (
        <div className="border rounded-lg p-10 text-center text-sm text-muted-foreground">
          Nenhuma NF rastreada para os filtros selecionados.
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:bg-card">
                <TableRow className="text-xs bg-card hover:bg-card">
                  <SortableTableHead column="nf" sort={sort} onSort={setSort}>NF</SortableTableHead>
                  <SortableTableHead column="transportadora" sort={sort} onSort={setSort}>Transportadora</SortableTableHead>
                  <SortableTableHead column="destinatario" sort={sort} onSort={setSort}>Destinatário</SortableTableHead>
                  <SortableTableHead column="status" sort={sort} onSort={setSort}>Status</SortableTableHead>
                  <SortableTableHead column="previsao" sort={sort} onSort={setSort}>Previsão</SortableTableHead>
                  <SortableTableHead column="entrega" sort={sort} onSort={setSort}>Entrega</SortableTableHead>
                  <SortableTableHead column="valor" sort={sort} onSort={setSort} align="right" className="text-right">Valor NF</SortableTableHead>
                  <TableHead>Pedido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.map((r) => (
                  <LinhaRastreio key={r.id} r={r} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaRastreio({ r }: { r: RastreioNfRow }) {
  const st = statusBadge(r.classe);
  return (
    <TableRow className="text-xs">
      <TableCell className="font-mono">
        {r.nf_numero ?? "—"}{r.nf_serie ? ` / ${r.nf_serie}` : ""}
      </TableCell>
      <TableCell className="max-w-[160px] truncate">{r.transportadora_nome ?? "—"}</TableCell>
      <TableCell className="max-w-[240px]">
        <div className="truncate">{r.destinatario ?? "—"}</div>
        <div className="text-[10px] text-muted-foreground">
          {r.cidade_destino ?? "—"}{r.uf_destino ? ` / ${r.uf_destino}` : ""}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 flex-wrap">
          <Badge variant="outline" className={cn("text-[10px] border", st.cls)}>{st.label}</Badge>
          {r.eh_devolucao && (
            <Badge className="text-[10px] bg-destructive text-destructive-foreground border-destructive">
              Devolução
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>{fmtData(r.previsao_entrega)}</TableCell>
      <TableCell>{fmtData(r.data_entrega)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.valor_nf != null ? formatBRL(Number(r.valor_nf)) : "—"}
      </TableCell>
      <TableCell>
        {r.pedido_id && r.pedido_numero ? (
          <Link
            to={`/pedidos/${r.pedido_id}`}
            className="font-mono text-primary hover:underline"
          >
            {r.pedido_numero}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
