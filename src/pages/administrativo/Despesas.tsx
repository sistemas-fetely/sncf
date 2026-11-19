import { useEstadoTela, resolverAcao } from "@/lib/navegacao";
import type { SetStateAction } from "react";
import { useRef as useRefNav } from "react";
/**
 * Despesas — registro único de despesas, todas as origens, por competência.
 *
 * Refator (26/07/2026): fonte trocada de `vw_despesas` para `vw_despesas_v2`.
 * Ganhos: dimensão Natureza de Investimento (camada gerencial) e a coluna
 * `estagio` do ciclo de vida da despesa, que substitui o antigo
 * `vinculo_status` (conciliada/pendente).
 *
 * Nota de campo: a v2 não expõe `numero_documento` nem `tipo_documento` —
 * a coluna "Nº doc" foi removida e a busca passou a cobrir CNPJ do fornecedor.
 */
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useListaPaginada, numeroAgregado, gruposAgregado, type FiltroLista } from "@/lib/lista/useListaPaginada";
import { formatBRL, formatDateBR } from "@/lib/format-currency";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEstagioMeta } from "@/lib/despesas/estagios";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MesaClassificacao } from "@/components/despesas/MesaClassificacao";
import { HojeTab } from "@/components/despesas/HojeTab";
import { CustoObrigatorioTab } from "@/components/despesas/CustoObrigatorioTab";
import { useGruposMesa } from "@/hooks/despesas/useMesaClassificacao";

type DespesaV2 = {
  id: string;
  origem_porta: string | null;
  data_competencia: string | null;
  valor: number | null;
  descricao: string | null;
  fornecedor_nome: string | null;
  fornecedor_cnpj: string | null;
  plano_contas_id: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  centro_custo_id: string | null;
  centro_codigo: string | null;
  centro_nome: string | null;
  natureza_investimento_id: string | null;
  natureza_codigo: string | null;
  natureza_nome: string | null;
  classificada_por: string | null;
  status_caixa: string | null;
  data_pagamento: string | null;
  documento_id: string | null;
  fatura_lancamento_id: string | null;
  estagio: string | null;
  valor_alocado: number | null;
  saldo_a_pagar: number | null;
  created_at: string | null;
};

const PAGE_SIZE = 50;
const SEM_NATUREZA = "__sem_natureza__";

const MESES_ABBR = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Rótulo curto de cada porta de entrada da despesa. */
const ORIGEM_LABEL: Record<string, string> = {
  nf: "NF",
  documento: "Doc",
  cartao: "Cartão",
  extrato: "Extrato",
  manual: "Manual",
};

/** Filtros de estágio (não inclui `indefinido` — é sentinela de erro). */
const ESTAGIO_FILTROS: { value: string; label: string }[] = [
  { value: "completa", label: "Completa" },
  { value: "aguardando_pagamento", label: "Aguarda pagamento" },
  { value: "parcialmente_pago", label: "Parcialmente pago" },
  { value: "em_conta_corrente", label: "Em conta corrente" },
  { value: "sem_documento", label: "Sem documento" },
  { value: "a_classificar", label: "A classificar" },
];

function mesLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return `${MESES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(-2)}`;
}

function mesKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function BadgeOrigem({ origem }: { origem: string | null }) {
  if (!origem) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className="w-fit font-normal">
      {ORIGEM_LABEL[origem] ?? origem}
    </Badge>
  );
}

function BadgeEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-muted-foreground">—</span>;
  const meta = getEstagioMeta(estagio);
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export default function Despesas() {
  // TELA-LEMBRA-ONDE-EU-ESTAVA: filtros da lista na URL.
  const [nav, setNav] = useEstadoTela({ busca: "", mes: "todos", pagina: 1 }, { replaceKeys: ["busca"] });
  const [abaNav, setAbaNav] = useEstadoTela({ aba: "hoje" });
  const gruposMesa = useGruposMesa();
  const pendentesMesa = (gruposMesa.data ?? []).filter((g) => g.itens_sem_plano > 0).length;
  const busca = nav.busca; const setBusca = (v: SetStateAction<typeof busca>) => setNav({ busca: resolverAcao(v, busca) as never });
  const [origem, setOrigem] = useState<string>("todas");
  const mes = nav.mes as string; const setMes = (v: SetStateAction<typeof mes>) => setNav({ mes: resolverAcao(v, mes) as never });
  const [plano, setPlano] = useState<string>("todos");
  const [natureza, setNatureza] = useState<string>("todas");
  const [estagio, setEstagio] = useState<string>("todos");
  const pagina = nav.pagina; const setPagina = (v: SetStateAction<typeof pagina>) => setNav({ pagina: resolverAcao(v, pagina) as never });

  const filtros: FiltroLista[] = [];
  if (origem !== "todas") filtros.push({ c: "origem_porta", op: "eq", v: origem });
  if (mes !== "todos") {
    const [ano, m] = mes.split("-").map(Number);
    const prox = new Date(ano, m, 1);
    filtros.push({ c: "data_competencia", op: "gte", v: `${mes}-01` }, { c: "data_competencia", op: "lt", v: `${prox.getFullYear()}-${String(prox.getMonth()+1).padStart(2,"0")}-01` });
  }
  if (plano !== "todos") filtros.push({ c: "plano_codigo", op: "eq", v: plano });
  if (natureza !== "todas") filtros.push(natureza === SEM_NATUREZA ? { c: "natureza_codigo", op: "is_null" } : { c: "natureza_codigo", op: "eq", v: natureza });
  if (estagio !== "todos") filtros.push({ c: "estagio", op: "eq", v: estagio });
  const listaQ = useListaPaginada<DespesaV2>({ relacao: "vw_despesas_v2", busca, filtros, pagina, tamanho: PAGE_SIZE,
    ordem: [{ c: "data_competencia", dir: "desc" }, { c: "id", dir: "asc" }],
    agregados: [
      { id: "total", fn: "sum", c: "valor" }, { id: "n", fn: "count" },
      { id: "completas", fn: "count", onde: ["plano_contas_id", "centro_custo_id", "natureza_investimento_id"].map(c => ({ c, op: "not_null" })) },
      { id: "pagas", fn: "count", onde: [{ c: "status_caixa", op: "eq", v: "pago" }] },
      { id: "aClassificarN", fn: "count", onde: [{ c: "estagio", op: "eq", v: "a_classificar" }] },
      { id: "aClassificarValor", fn: "sum", c: "valor", onde: [{ c: "estagio", op: "eq", v: "a_classificar" }] },
    ] });
  const { isLoading, error } = listaQ;
  const opcoesQ = useListaPaginada({ relacao: "vw_despesas_v2", tamanho: 1, agregados: [
    { id: "origens", fn: "count", por: ["origem_porta"] },
    { id: "meses", fn: "count", por: [{ c: "data_competencia", trunc: "month" }] },
    { id: "planos", fn: "count", por: ["plano_codigo", "plano_nome"] },
    { id: "naturezas", fn: "count", por: ["natureza_codigo", "natureza_nome"] },
  ] });
  const origensDisponiveis = gruposAgregado(opcoesQ.data?.agregados, "origens").filter(g => g.origem_porta).map(g => String(g.origem_porta)).sort((a,b) => (ORIGEM_LABEL[a] ?? a).localeCompare(ORIGEM_LABEL[b] ?? b));
  const mesesDisponiveis = gruposAgregado(opcoesQ.data?.agregados, "meses").filter(g => g.data_competencia).map(g => [String(g.data_competencia), mesLabel(`${g.data_competencia}-01`)]).sort((a,b) => b[0].localeCompare(a[0]));
  const planosDisponiveis = gruposAgregado(opcoesQ.data?.agregados, "planos").filter(g => g.plano_codigo).map(g => [String(g.plano_codigo), `${g.plano_codigo} — ${g.plano_nome ?? ""}`]).sort((a,b) => a[0].localeCompare(b[0]));
  const ng = gruposAgregado(opcoesQ.data?.agregados, "naturezas");
  const naturezasDisponiveis = { itens: ng.filter(g => g.natureza_codigo).map(g => [String(g.natureza_codigo), String(g.natureza_nome ?? g.natureza_codigo)]).sort((a,b) => a[1].localeCompare(b[1])), temSem: ng.some(g => !g.natureza_codigo) };
  const ag = listaQ.data?.agregados;
  const n = numeroAgregado(ag, "n"), completas = numeroAgregado(ag, "completas"), pagas = numeroAgregado(ag, "pagas");
  const kpis = { total: numeroAgregado(ag, "total"), n, completas, pagas, pctCompletas: n ? completas / n * 100 : 0,
    pctPagas: n ? pagas / n * 100 : 0, aClassificarN: numeroAgregado(ag, "aClassificarN"), aClassificarValor: numeroAgregado(ag, "aClassificarValor") };

  // Reset de página quando qualquer filtro muda
  const montouPag = useRefNav(false); // nav
  useEffect(() => {
    if (!montouPag.current) { montouPag.current = true; return; }
    setPagina(1);
  }, [busca, origem, mes, plano, natureza, estagio]);

  const totalPaginas = Math.max(1, Math.ceil((listaQ.data?.total ?? 0) / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const paginadas = listaQ.data?.linhas ?? [];

  const COLSPAN = 9;

  return (
    <PageShell>
      <PageHeader
        titulo="Despesas"
        estado="Registro único de despesas — todas as origens, por competência."
      />

      <Tabs value={abaNav.aba as string} onValueChange={(v) => setAbaNav({ aba: v })}>
        <TabsList>
          <TabsTrigger value="hoje">Hoje</TabsTrigger>
          <TabsTrigger value="lista">Lista</TabsTrigger>
          <TabsTrigger value="classificar">A classificar{gruposMesa.isSuccess ? ` · ${pendentesMesa}` : ""}</TabsTrigger>
          <TabsTrigger value="custo-obrigatorio">Custo obrigatório</TabsTrigger>
        </TabsList>
        <TabsContent value="hoje" className="mt-4"><HojeTab abrirClassificar={() => setAbaNav({ aba: "classificar" })} /></TabsContent>
        <TabsContent value="classificar" className="mt-4"><MesaClassificacao /></TabsContent>
        <TabsContent value="custo-obrigatorio" className="mt-4"><CustoObrigatorioTab /></TabsContent>
        <TabsContent value="lista" className="mt-4 space-y-4">
      {(error || opcoesQ.error) && (
        <Card className="border-destructive">
          <CardContent className="p-4 flex items-start gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Erro ao carregar despesas</div>
              <div className="text-sm opacity-90">{(error ?? opcoesQ.error)?.message}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total</div>
            <div className="text-2xl font-serif mt-1">{formatBRL(kpis.total)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.n} {kpis.n === 1 ? "despesa" : "despesas"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Classificação completa
            </div>
            <div className="text-2xl font-serif mt-1">{kpis.pctCompletas.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.completas}/{kpis.n} · plano + centro + natureza
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Pagas</div>
            <div className="text-2xl font-serif mt-1">{kpis.pctPagas.toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {kpis.pagas}/{kpis.n} · caixa liquidado
            </div>
          </CardContent>
        </Card>
        <Card
          className={cn(
            kpis.aClassificarN > 0 && "border-warning/40 bg-warning/10",
          )}
        >
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              A classificar
              {kpis.aClassificarN > 0 && (
                <AlertCircle className="h-3 w-3 text-warning" />
              )}
            </div>
            <div
              className={cn(
                "text-2xl font-serif mt-1",
                kpis.aClassificarN > 0 ? "text-warning" : "text-success",
              )}
            >
              {kpis.aClassificarN}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatBRL(kpis.aClassificarValor)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Input
          placeholder="Buscar fornecedor, descrição, CNPJ…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Select value={origem} onValueChange={setOrigem}>
          <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as origens</SelectItem>
            {origensDisponiveis.map((o) => (
              <SelectItem key={o} value={o}>{ORIGEM_LABEL[o] ?? o}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mes} onValueChange={setMes}>
          <SelectTrigger><SelectValue placeholder="Competência" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os meses</SelectItem>
            {mesesDisponiveis.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={plano} onValueChange={setPlano}>
          <SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {planosDisponiveis.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={natureza} onValueChange={setNatureza}>
          <SelectTrigger><SelectValue placeholder="Natureza" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as naturezas</SelectItem>
            {naturezasDisponiveis.itens.map(([k, l]) => (
              <SelectItem key={k} value={k}>{l}</SelectItem>
            ))}
            {naturezasDisponiveis.temSem && (
              <SelectItem value={SEM_NATUREZA}>⚠️ Sem natureza</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select value={estagio} onValueChange={setEstagio}>
          <SelectTrigger><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os estágios</SelectItem>
            {ESTAGIO_FILTROS.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Natureza</TableHead>
                <TableHead>Centro</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Estágio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center text-muted-foreground py-8">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && paginadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLSPAN} className="text-center text-muted-foreground py-8">
                    Nenhuma despesa encontrada.
                  </TableCell>
                </TableRow>
              )}
              {paginadas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">
                    {r.data_competencia ? formatDateBR(r.data_competencia) : "—"}
                  </TableCell>
                  <TableCell>
                    <BadgeOrigem origem={r.origem_porta} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{r.fornecedor_nome ?? "—"}</span>
                      {r.fornecedor_cnpj && (
                        <span className="text-[11px] text-muted-foreground">
                          {r.fornecedor_cnpj}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <div className="truncate text-sm" title={r.descricao ?? ""}>
                      {r.descricao ?? "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {r.plano_codigo ? (
                      <span className="text-sm">
                        {r.plano_codigo} — {r.plano_nome ?? ""}
                      </span>
                    ) : (
                      <Badge variant="outline" className="border-warning/40 text-warning">
                        sem plano
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.natureza_nome ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal whitespace-nowrap"
                      >
                        {r.natureza_nome}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{r.centro_codigo ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                    <div>{formatBRL(Number(r.valor || 0))}</div>
                    {r.estagio === "parcialmente_pago" && r.saldo_a_pagar != null && (
                      <div className="text-[11px] text-muted-foreground font-normal">
                        saldo {formatBRL(Number(r.saldo_a_pagar))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <BadgeEstagio estagio={r.estagio} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paginação */}
      {(listaQ.data?.total ?? 0) > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {(paginaAtual - 1) * PAGE_SIZE + 1}–
            {Math.min(paginaAtual * PAGE_SIZE, (listaQ.data?.total ?? 0))} de {(listaQ.data?.total ?? 0)}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
            >Anterior</Button>
            <span className="text-sm">{paginaAtual} / {totalPaginas}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
            >Próxima</Button>
          </div>
        </div>
      )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
