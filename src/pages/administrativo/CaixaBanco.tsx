/**
 * Gerencial — resultado por competência, em camadas de natureza.
 *
 * Refator (26/07/2026): fonte trocada de `vw_movimentacoes_gerencial` para
 * `vw_despesas_v2` (competência = `data_competencia`), e a visão passou a ter
 * três agrupamentos: Natureza (padrão) · Plano de Contas · Centro de Custo.
 *
 * A ordem das camadas NÃO é hardcode: vem de `naturezas_investimento.ordem`
 * (doutrina DIMENSÃO-VIA-TABELA). Cadastrar camada nova não exige mexer aqui.
 *
 * Nota: o conteúdo antes era delegado a <MovimentacoesGerencial />. Esse
 * componente e o hook `useMovimentacoesGerencial` foram REMOVIDOS em 27/07/2026.
 * A view vw_movimentacoes_gerencial permanece no banco de propósito:
 * vw_analise_despesas depende dela e alimenta AnaliseDespesas.tsx.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  Hourglass,
  Layers,
  PieChart,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";

type DespesaV2 = {
  id: string;
  origem_porta: string | null;
  data_competencia: string | null;
  valor: number | null;
  descricao: string | null;
  fornecedor_nome: string | null;
  plano_contas_id: string | null;
  plano_codigo: string | null;
  plano_nome: string | null;
  centro_custo_id: string | null;
  centro_codigo: string | null;
  centro_nome: string | null;
  natureza_investimento_id: string | null;
  natureza_codigo: string | null;
  natureza_nome: string | null;
  status_caixa: string | null;
  estagio: string | null;
};

type NaturezaDim = {
  codigo: string;
  nome: string;
  ordem: number | null;
  ativo: boolean | null;
  grupo_dre: string | null;
};

/** Grupo de DRE agregado a partir da dimensao — nao ha lista fixa no codigo. */
type GrupoDre = {
  chave: string;
  label: string;
  membros: string[];
  codigos: string[];
  ordem: number;
  valor: number;
};

type Agrupamento = "natureza" | "plano" | "centro";

const A_CLASSIFICAR = "__a_classificar__";
const SEM_CLASSIFICACAO = "__sem__";

/**
 * Rotulo de exibicao dos grupos de DRE. Isto e COSMETICO: o agrupamento em si
 * vem de naturezas_investimento.grupo_dre, e a ordem de MIN(ordem) do grupo.
 * Grupo novo cadastrado no banco gera card sozinho, com o codigo capitalizado
 * como rotulo — sem quebrar nada e sem exigir deploy.
 */
const GRUPO_DRE_LABEL: Record<string, string> = {
  operacional: "Resultado Operacional",
  capex: "CAPEX",
  estruturante: "Estruturante",
};

function labelGrupoDre(chave: string): string {
  return GRUPO_DRE_LABEL[chave] ?? chave.charAt(0).toUpperCase() + chave.slice(1);
}

const ORIGEM_LABEL: Record<string, string> = {
  nf: "NF",
  documento: "Doc",
  cartao: "Cartão",
  extrato: "Extrato",
  manual: "Manual",
};

const ESTAGIO_META: Record<string, { label: string; className: string }> = {
  completa: {
    label: "completa",
    className: "bg-emerald-600 hover:bg-emerald-600 text-white border-transparent",
  },
  aguardando_pagamento: {
    label: "aguarda pgto",
    className: "bg-blue-50 text-blue-700 border-blue-400",
  },
  sem_documento: {
    label: "sem documento",
    className: "bg-amber-100 text-amber-800 border-amber-400",
  },
  a_classificar: {
    label: "a classificar",
    className: "bg-transparent text-red-600 border-red-400",
  },
};

/** Competência normalizada para o 1º dia do mês (chave da coluna da matriz). */
function competenciaKey(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function competenciaAtualISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}


function labelMesCurto(iso: string): string {
  const [y, m] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt
    .toLocaleDateString("pt-BR", { month: "short", year: "2-digit" })
    .replace(".", "")
    .replace(" de ", "/")
    .replace(" ", "/");
}

function labelMesLongo(iso: string): string {
  const [y, m] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, 1);
  return dt.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function BadgeEstagio({ estagio }: { estagio: string | null }) {
  if (!estagio) return <span className="text-muted-foreground">—</span>;
  const meta = ESTAGIO_META[estagio];
  if (!meta) return <Badge variant="outline" className="text-[10px]">{estagio}</Badge>;
  return (
    <Badge variant="outline" className={cn("text-[10px] whitespace-nowrap", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export default function CaixaBanco() {
  const navigate = useNavigate();
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("natureza");
  const [drill, setDrill] = useState<
    { chave: string; nome: string; competencia: string | null } | null
  >(null);

  const { data: linhas = [], isLoading, error } = useQuery({
    queryKey: ["gerencial", "vw_despesas_v2"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_despesas_v2")
        .select(
          "id, origem_porta, data_competencia, valor, descricao, fornecedor_nome, " +
            "plano_contas_id, plano_codigo, plano_nome, centro_custo_id, centro_codigo, " +
            "centro_nome, natureza_investimento_id, natureza_codigo, natureza_nome, " +
            "status_caixa, estagio",
        )
        .order("data_competencia", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DespesaV2[];
    },
  });

  /** Ordem das camadas vem da dimensão, não do código. */
  const { data: naturezas = [] } = useQuery({
    queryKey: ["naturezas_investimento", "ordem"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("naturezas_investimento")
        .select("codigo, nome, ordem, ativo, grupo_dre")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as NaturezaDim[];
    },
  });

  // Competências com dados (colunas da matriz)
  const competencias = useMemo(() => {
    const set = new Set<string>();
    for (const l of linhas) {
      if (l.data_competencia) set.add(competenciaKey(l.data_competencia));
    }
    return Array.from(set).sort();
  }, [linhas]);

  /**
   * Bucket da linha no agrupamento corrente. Buckets são mutuamente
   * exclusivos — o Total geral sempre fecha com o KPI "Total do período".
   */
  function bucketDe(l: DespesaV2, modo: Agrupamento): { chave: string; nome: string } {
    if (modo === "natureza") {
      if (!l.plano_contas_id || !l.natureza_codigo) {
        return { chave: A_CLASSIFICAR, nome: "⚠️ A classificar" };
      }
      return { chave: l.natureza_codigo, nome: l.natureza_nome ?? l.natureza_codigo };
    }
    if (modo === "plano") {
      if (!l.plano_codigo) return { chave: SEM_CLASSIFICACAO, nome: "⚠️ Sem classificação" };
      return {
        chave: l.plano_codigo,
        nome: `${l.plano_codigo} — ${l.plano_nome ?? ""}`.trim(),
      };
    }
    if (!l.centro_codigo) return { chave: SEM_CLASSIFICACAO, nome: "⚠️ Sem classificação" };
    return {
      chave: l.centro_codigo,
      nome: `${l.centro_codigo} — ${l.centro_nome ?? ""}`.trim(),
    };
  }

  type LinhaMatriz = {
    chave: string;
    nome: string;
    porMes: Map<string, number>;
    total: number;
    qtd: number;
    alerta: boolean;
  };

  const matriz = useMemo<LinhaMatriz[]>(() => {
    const map = new Map<string, LinhaMatriz>();

    const novaLinha = (chave: string, nome: string): LinhaMatriz => ({
      chave,
      nome,
      porMes: new Map(),
      total: 0,
      qtd: 0,
      alerta: chave === A_CLASSIFICAR || chave === SEM_CLASSIFICACAO,
    });

    // Na visão Natureza, semeia todas as camadas ativas na ordem da dimensão —
    // camada sem movimento no período aparece zerada, não desaparece.
    if (agrupamento === "natureza") {
      for (const n of naturezas) map.set(n.codigo, novaLinha(n.codigo, n.nome));
    }

    for (const l of linhas) {
      if (!l.data_competencia) continue;
      const { chave, nome } = bucketDe(l, agrupamento);
      let row = map.get(chave);
      if (!row) {
        row = novaLinha(chave, nome);
        map.set(chave, row);
      }
      const c = competenciaKey(l.data_competencia);
      const v = Number(l.valor || 0);
      row.porMes.set(c, (row.porMes.get(c) || 0) + v);
      row.total += v;
      row.qtd += 1;
    }

    const rows = Array.from(map.values());

    if (agrupamento === "natureza") {
      const ordem = new Map(naturezas.map((n, i) => [n.codigo, i]));
      return rows.sort((a, b) => {
        if (a.chave === A_CLASSIFICAR) return 1;
        if (b.chave === A_CLASSIFICAR) return -1;
        return (ordem.get(a.chave) ?? 999) - (ordem.get(b.chave) ?? 999);
      });
    }

    return rows.sort((a, b) => {
      if (a.chave === SEM_CLASSIFICACAO) return 1;
      if (b.chave === SEM_CLASSIFICACAO) return -1;
      return b.total - a.total;
    });
  }, [linhas, naturezas, agrupamento]);

  const totaisMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of competencias) m.set(c, 0);
    for (const row of matriz) {
      for (const [c, v] of row.porMes) m.set(c, (m.get(c) || 0) + v);
    }
    return m;
  }, [matriz, competencias]);

  /** KPIs do período todo — independentes do agrupamento escolhido. */
  const kpis = useMemo(() => {
    const total = linhas.reduce((s, l) => s + Number(l.valor || 0), 0);
    const n = linhas.length;
    const completas = linhas.filter(
      (l) => l.plano_contas_id && l.centro_custo_id && l.natureza_investimento_id,
    ).length;
    return {
      total,
      n,
      completas,
      pctCompletas: n > 0 ? Math.round((completas / n) * 100) : 100,
    };
  }, [linhas]);

  /**
   * Grupos de DRE montados a partir de naturezas_investimento.grupo_dre.
   * Ordem do grupo = MIN(ordem) das naturezas que o compoem; subtitulo =
   * nomes das naturezas na ordem da dimensao. Nada fixo no codigo.
   */
  const gruposDre = useMemo<GrupoDre[]>(() => {
    const porGrupo = new Map<string, GrupoDre>();
    const ordenadas = [...naturezas].sort(
      (a, b) => (a.ordem ?? 999) - (b.ordem ?? 999),
    );
    for (const ni of ordenadas) {
      const chave = ni.grupo_dre;
      if (!chave) continue;
      let g = porGrupo.get(chave);
      if (!g) {
        g = {
          chave,
          label: labelGrupoDre(chave),
          membros: [],
          codigos: [],
          ordem: ni.ordem ?? 999,
          valor: 0,
        };
        porGrupo.set(chave, g);
      }
      g.membros.push(ni.nome);
      g.codigos.push(ni.codigo);
    }
    for (const l of linhas) {
      if (!l.natureza_codigo) continue;
      for (const g of porGrupo.values()) {
        if (g.codigos.includes(l.natureza_codigo)) {
          g.valor += Number(l.valor || 0);
          break;
        }
      }
    }
    return Array.from(porGrupo.values()).sort((a, b) => a.ordem - b.ordem);
  }, [naturezas, linhas]);

  const mesCorrente = competenciaAtualISO();
  const totalCorrente = totaisMes.get(mesCorrente) || 0;

  /**
   * O mes corrente NAO recebe comparacao percentual. data_competencia e
   * competencia, nao caixa: NF com competencia deste mes ainda vai chegar
   * depois que o mes acabar. Comparar com mes anterior fechado seria falsa
   * precisao. Em vez de %, mostramos o sinal de formacao: quantas linhas do
   * mes ainda esperam documento ou classificacao.
   */
  const formacaoMes = useMemo(() => {
    const doMes = linhas.filter(
      (l) => l.data_competencia && competenciaKey(l.data_competencia) === mesCorrente,
    );
    const pendentes = doMes.filter(
      (l) => l.estagio === "sem_documento" || l.estagio === "a_classificar",
    );
    return { n: doMes.length, pendentes: pendentes.length };
  }, [linhas, mesCorrente]);

  // Drill-down
  const drillItens = useMemo<DespesaV2[]>(() => {
    if (!drill) return [];
    return linhas.filter((l) => {
      if (!l.data_competencia) return false;
      if (bucketDe(l, agrupamento).chave !== drill.chave) return false;
      if (drill.competencia && competenciaKey(l.data_competencia) !== drill.competencia) {
        return false;
      }
      return true;
    });
  }, [drill, linhas, agrupamento]);

  const drillTotal = drillItens.reduce((s, l) => s + Number(l.valor || 0), 0);

  // Trocar de agrupamento invalida o drill aberto (a chave muda de significado)
  useEffect(() => {
    setDrill(null);
  }, [agrupamento]);

  function abrirDrill(chave: string, nome: string, competencia: string | null) {
    setDrill({ chave, nome, competencia });
  }

  const rotuloColuna =
    agrupamento === "natureza"
      ? "Camada de natureza"
      : agrupamento === "plano"
        ? "Plano de contas"
        : "Centro de custo";

  const ABAS: { value: Agrupamento; label: string }[] = [
    { value: "natureza", label: "Por Natureza" },
    { value: "plano", label: "Por Plano de Contas" },
    { value: "centro", label: "Por Centro de Custo" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* HEADER STICKY */}
      <div className="sticky top-0 z-20 bg-background px-6 pt-6 pb-3 border-b backdrop-blur">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <PieChart className="h-6 w-6 text-admin" />
              Gerencial
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Resultado por competência — todas as origens de despesa, em camadas de
              natureza.
            </p>
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 pt-3">
        <div className="space-y-3">
          {error && (
            <Card className="border-destructive">
              <CardContent className="p-4 flex items-start gap-2 text-destructive">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">Erro ao carregar despesas</div>
                  <div className="text-sm opacity-90">{(error as Error).message}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Abas */}
          <div className="flex flex-wrap gap-1 items-center">
            {ABAS.map((a) => (
              <Button
                key={a.value}
                size="sm"
                variant={agrupamento === a.value ? "default" : "outline"}
                onClick={() => setAgrupamento(a.value)}
                className={agrupamento === a.value ? "bg-admin hover:bg-admin/90" : ""}
              >
                {a.label}
              </Button>
            ))}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Total do período</div>
                <div className="text-2xl font-bold font-mono mt-1">
                  {formatBRL(kpis.total)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {competencias.length} {competencias.length === 1 ? "mês" : "meses"} ·{" "}
                  {kpis.n} despesas
                </div>
              </CardContent>
            </Card>
            {gruposDre.map((g) => (
              <Card key={g.chave}>
                <CardContent className="p-4">
                  <div className="text-xs text-muted-foreground">{g.label}</div>
                  <div className="text-2xl font-bold font-mono mt-1">
                    {formatBRL(g.valor)}
                  </div>
                  <div
                    className="text-[11px] text-muted-foreground mt-0.5 truncate"
                    title={g.membros.join(" + ")}
                  >
                    {g.membros.join(" + ")}
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card className="border-dashed">
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {labelMesLongo(mesCorrente)}
                  <Hourglass className="h-3 w-3" />
                </div>
                <div className="text-2xl font-bold font-mono mt-1">
                  {formatBRL(totalCorrente)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  competência em formação
                  {formacaoMes.pendentes > 0 && (
                    <> · {formacaoMes.pendentes} de {formacaoMes.n} sem documento ou classificação</>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className={cn(kpis.pctCompletas < 100 && "border-amber-300 bg-amber-50/50")}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  Classificação completa
                  {kpis.pctCompletas < 100 && (
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                  )}
                </div>
                <div
                  className={cn(
                    "text-2xl font-bold mt-1",
                    kpis.pctCompletas < 100 ? "text-amber-700" : "text-emerald-700",
                  )}
                >
                  {kpis.pctCompletas}%
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {kpis.completas}/{kpis.n} · plano + centro + natureza
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Matriz */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : linhas.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center space-y-3">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma despesa no período.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/administrativo-fetely/nfs-stage")}
                  className="gap-2"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Ir para NFs Stage
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="border rounded-md overflow-auto">
              <Table>
                <TableHeader className="bg-muted/60 sticky top-0">
                  <TableRow>
                    <TableHead className="min-w-[240px]">{rotuloColuna}</TableHead>
                    {competencias.map((c) => (
                      <TableHead key={c} className="text-right whitespace-nowrap">
                        {labelMesCurto(c)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap border-l">
                      Total
                    </TableHead>
                    <TableHead className="text-right whitespace-nowrap w-20">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matriz.map((row) => {
                    const pct = kpis.total > 0 ? (row.total / kpis.total) * 100 : 0;
                    return (
                      <TableRow
                        key={row.chave}
                        className={cn(row.alerta && "bg-amber-50/60")}
                      >
                        <TableCell>
                          <button
                            className="text-left font-medium hover:underline flex items-center gap-2"
                            onClick={() => abrirDrill(row.chave, row.nome, null)}
                          >
                            <span className={cn(row.alerta && "text-amber-700")}>
                              {row.nome}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-normal">
                              {row.qtd > 0 ? `${row.qtd}` : ""}
                            </span>
                          </button>
                        </TableCell>
                        {competencias.map((c) => {
                          const v = row.porMes.get(c);
                          return (
                            <TableCell key={c} className="text-right font-mono text-sm p-2">
                              {v && v !== 0 ? (
                                <button
                                  className="hover:underline hover:text-admin"
                                  onClick={() => abrirDrill(row.chave, row.nome, c)}
                                >
                                  {formatBRL(v)}
                                </button>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell
                          className={cn(
                            "text-right font-mono font-semibold border-l",
                            row.alerta && "text-amber-700",
                          )}
                        >
                          {formatBRL(row.total)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {pct.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Total geral */}
                  <TableRow className="bg-muted/70 font-semibold border-t-2">
                    <TableCell>Total geral</TableCell>
                    {competencias.map((c) => (
                      <TableCell key={c} className="text-right font-mono">
                        {formatBRL(totaisMes.get(c) || 0)}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono border-l">
                      {formatBRL(kpis.total)}
                    </TableCell>
                    <TableCell className="text-right text-xs">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Drill-down */}
        <Sheet open={!!drill} onOpenChange={(o) => !o && setDrill(null)}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            <SheetHeader>
              <SheetTitle>
                {drill?.nome}
                {drill?.competencia && (
                  <span className="text-muted-foreground font-normal">
                    {" — "}
                    {labelMesLongo(drill.competencia)}
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>
                {drillItens.length} despesa{drillItens.length === 1 ? "" : "s"} ·{" "}
                <span className="font-mono font-semibold">{formatBRL(drillTotal)}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="mt-4 border rounded-md">
              <Table>
                <TableHeader className="bg-muted/60">
                  <TableRow>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>
                      {agrupamento === "natureza" ? "Plano" : "Natureza"}
                    </TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Estágio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillItens.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.fornecedor_nome || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[240px] truncate">
                        {l.descricao || "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {agrupamento === "natureza"
                          ? l.plano_nome || (
                              <span className="text-muted-foreground italic text-xs">sem</span>
                            )
                          : l.natureza_nome || (
                              <span className="text-muted-foreground italic text-xs">sem</span>
                            )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.origem_porta ? ORIGEM_LABEL[l.origem_porta] ?? l.origem_porta : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatBRL(Number(l.valor || 0))}
                      </TableCell>
                      <TableCell>
                        <BadgeEstagio estagio={l.estagio} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
