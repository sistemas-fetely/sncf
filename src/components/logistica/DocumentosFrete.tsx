import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead, type SortState } from "@/components/shared/SortableTableHead";
import { KpiPill } from "@/components/shared/KpiPill";
import { cn } from "@/lib/utils";
import { useDocumentosFrete, type DocumentoFreteRow } from "@/hooks/logistica/useLogisticaRemessas";
import { brl, dataBr, ddmmHora, isoDiasAtras, NUM } from "@/lib/logistica/formato";
import { BadgeAuditoria, ComposicaoFrete } from "./ComposicaoFrete";

type Nat = "todos" | "normal" | "reentrega" | "devolucao" | "outros";
type Extra = "sem_pedido" | "acima" | "sem_ref" | null;
const PERIODOS = [{ v: 90, l: "90 dias" }, { v: 180, l: "180 dias" }, { v: 0, l: "Tudo" }];

function natureza(d: DocumentoFreteRow): Exclude<Nat, "todos"> {
  if (d.tipo_doc === "postagem") return "normal";
  const n = (d.natureza ?? "").toLowerCase();
  if (!n || n.includes("normal")) return "normal";
  if (n.includes("reentrega")) return "reentrega";
  if (n.includes("devolu")) return "devolucao";
  return "outros";
}
const EXTRA: Record<Exclude<Extra, null>, (d: DocumentoFreteRow) => boolean> = {
  sem_pedido: (d) => d.status_vinculo !== "ok",
  acima: (d) => d.auditoria_status === "acima_referencia",
  sem_ref: (d) => d.auditoria_status === "sem_referencia",
};

type Col = "tipo" | "numero" | "data" | "natureza" | "nf" | "pedido" | "destino" | "peso" | "valor_nf" | "valor_doc" | "pct" | "auditoria";
const VAL: Record<Col, (d: DocumentoFreteRow) => string | number | null> = {
  tipo: (d) => d.tipo_doc, numero: (d) => d.numero, data: (d) => d.data_doc, natureza: (d) => d.natureza,
  nf: (d) => d.nf_numero, pedido: (d) => d.pedido_ref, destino: (d) => `${d.uf_destino ?? ""}${d.cidade_destino ?? ""}`,
  peso: (d) => d.peso_taxado, valor_nf: (d) => d.valor_nf, valor_doc: (d) => d.valor_doc, pct: (d) => d.pct_frete_nf,
  auditoria: (d) => d.auditoria_status,
};

export function DocumentosFrete({ transportadoraId }: { transportadoraId: string }) {
  const [dias, setDias] = useState(90);
  const { data = [], isLoading, error, refetch } = useDocumentosFrete(transportadoraId, dias ? isoDiasAtras(dias) : null);
  const [nat, setNat] = useState<Nat>("todos");
  const [extra, setExtra] = useState<Extra>(null);
  const [sort, setSort] = useState<SortState<Col> | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const cont = useMemo(() => {
    const c: Record<string, number> = { todos: data.length, normal: 0, reentrega: 0, devolucao: 0, outros: 0, sem_pedido: 0, acima: 0, sem_ref: 0 };
    for (const d of data) {
      c[natureza(d)]++;
      for (const k of Object.keys(EXTRA) as (keyof typeof EXTRA)[]) if (EXTRA[k](d)) c[k]++;
    }
    return c;
  }, [data]);

  const linhas = useMemo(() => {
    const l = data.filter((d) => (nat === "todos" || natureza(d) === nat) && (!extra || EXTRA[extra](d)));
    if (!sort) return l;
    const f = VAL[sort.column];
    const s = sort.direction === "asc" ? 1 : -1;
    return [...l].sort((a, b) => {
      const va = f(a), vb = f(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * s;
    });
  }, [data, nat, extra, sort]);
  const soma = linhas.reduce((t, d) => t + Number(d.valor_doc ?? 0), 0);

  const natPills: { k: Nat; l: string }[] = [
    { k: "todos", l: "Todos" }, { k: "normal", l: "Normal" }, { k: "reentrega", l: "Reentrega" }, { k: "devolucao", l: "Devolução" }, { k: "outros", l: "Outros" },
  ];
  const extraPills: { k: Exclude<Extra, null>; l: string; c: "amber" | "gray" }[] = [
    { k: "sem_pedido", l: "Sem pedido", c: "gray" }, { k: "acima", l: "Acima da tabela", c: "amber" }, { k: "sem_ref", l: "Sem referência", c: "gray" },
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
      <div className="flex flex-wrap items-center gap-2">
        {natPills.map((p) => (
          <KpiPill key={p.k} label={p.l} count={cont[p.k]} color={p.k === "todos" ? "admin" : "blue"} active={nat === p.k}
            onClick={() => setNat(p.k === nat ? "todos" : p.k)} />
        ))}
        <span className="mx-1 h-10 w-px bg-border" aria-hidden />
        {extraPills.map((p) => (
          <KpiPill key={p.k} label={p.l} count={cont[p.k]} color={p.c} active={extra === p.k} onClick={() => setExtra(extra === p.k ? null : p.k)} />
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando documentos…</div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 space-y-2">
          <div className="flex items-center gap-2 text-destructive font-medium"><AlertTriangle className="h-4 w-4" /> Não foi possível carregar os documentos</div>
          <p className="text-sm">{error instanceof Error ? error.message : String(error)}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar de novo</Button>
        </div>
      ) : !linhas.length ? (
        <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">Nenhum documento no filtro.</div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6" />
                <SortableTableHead column="tipo" sort={sort} onSort={setSort}>Tipo</SortableTableHead>
                <SortableTableHead column="numero" sort={sort} onSort={setSort}>Número</SortableTableHead>
                <SortableTableHead column="data" sort={sort} onSort={setSort}>Data</SortableTableHead>
                <SortableTableHead column="natureza" sort={sort} onSort={setSort}>Natureza</SortableTableHead>
                <SortableTableHead column="nf" sort={sort} onSort={setSort}>NF</SortableTableHead>
                <SortableTableHead column="pedido" sort={sort} onSort={setSort}>Pedido</SortableTableHead>
                <SortableTableHead column="destino" sort={sort} onSort={setSort}>Destino</SortableTableHead>
                <SortableTableHead column="peso" sort={sort} onSort={setSort} align="right">Peso taxado (kg)</SortableTableHead>
                <SortableTableHead column="valor_nf" sort={sort} onSort={setSort} align="right">Valor NF</SortableTableHead>
                <SortableTableHead column="valor_doc" sort={sort} onSort={setSort} align="right">Valor do documento</SortableTableHead>
                <SortableTableHead column="pct" sort={sort} onSort={setSort} align="right">% NF</SortableTableHead>
                <SortableTableHead column="auditoria" sort={sort} onSort={setSort}>Auditoria</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((d) => {
                const exp = aberto === d.doc_id;
                return (
                  <Fragment key={d.doc_id}>
                    <TableRow className="cursor-pointer" onClick={() => setAberto(exp ? null : d.doc_id)}>
                      <TableCell>{exp ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell>{d.tipo_doc === "cte" ? "CT-e" : "Postagem"}</TableCell>
                      <TableCell>
                        <div className="tabular-nums">{d.numero ?? "—"}</div>
                        {d.minuta && <div className="text-xs text-muted-foreground">minuta {d.minuta}</div>}
                      </TableCell>
                      <TableCell className="tabular-nums">{dataBr(d.data_doc)}</TableCell>
                      <TableCell>{d.natureza ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{d.nf_numero ?? (d.nf_numeros?.join(", ") || "—")}</TableCell>
                      <TableCell>
                        {d.pedido_id ? (
                          <Link to={`/pedidos/${d.pedido_id}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{d.pedido_ref ?? "pedido"}</Link>
                        ) : <span className="text-warning text-xs">sem pedido</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{d.cidade_destino ?? "—"}/{d.uf_destino ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.peso_taxado == null ? "—" : NUM.format(d.peso_taxado)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(d.valor_nf)}</TableCell>
                      <TableCell className="text-right tabular-nums">{brl(d.valor_doc)}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.pct_frete_nf == null ? "—" : `${NUM.format(d.pct_frete_nf)}%`}</TableCell>
                      <TableCell><BadgeAuditoria status={d.auditoria_status} motivo={d.auditoria_motivo} /></TableCell>
                    </TableRow>
                    {exp && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={13} className="space-y-2">
                          <ComposicaoFrete composicao={d.composicao} />
                          {(d.ocorrencia_texto || d.ocorrencia_codigo) && (
                            <div className="text-xs">Ocorrência: {d.ocorrencia_codigo ? `${d.ocorrencia_codigo} — ` : ""}{d.ocorrencia_texto ?? ""} {d.ocorrencia_em ? `(${ddmmHora(d.ocorrencia_em)})` : ""}</div>
                          )}
                          {d.auditoria_motivo && <div className="text-xs">Auditoria: {d.auditoria_motivo}</div>}
                          {(d.importado_arquivo || d.importado_em) && (
                            <div className="text-xs text-muted-foreground">Arquivo {d.importado_arquivo ?? "—"} · importado em {ddmmHora(d.importado_em)}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="text-xs text-muted-foreground">{NUM.format(linhas.length)} documentos · {brl(soma)}</div>
    </div>
  );
}
