import { MultiSelectFilter } from "@/components/shared/MultiSelectFilter";
import { lerFiltroProduto } from "@/lib/produto/filtrosMultiplos";
import { useRef as __useRef } from "react";
import { useEstadoTela as __uet, resolverAcao as __ra, lerLista as __ll, escreverLista as __el } from "@/lib/navegacao";
import { useMemo as __useMemo, type SetStateAction as __SSA } from "react";
// Aba Histórico da Tabela de Preço — LEITURA PURA de vw_preco_historico_analise.
// Espelho do histórico de preços do FOP. Nenhuma escrita, nenhum botão de
// corrigir/desfazer/reverter. O dicionário de `sentido` é hardcode aqui, e só
// aqui: slug novo aparece cru, nunca escondido.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useListaPaginada, exportarLista, numeroAgregado, gruposAgregado, type ParamsLista, type FiltroLista } from "@/lib/lista/useListaPaginada";
import { toast } from "sonner";
import { formatError } from "@/lib/format-error";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Download,
  Loader2, MessageSquareText, Search,
} from "lucide-react";
import { RodapePaginacao, DEFAULT_PAGE_SIZE, type PageSizeOption } from "@/components/tabela/RodapePaginacao";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as ChartTooltip,
  XAxis, YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Linha da view vw_preco_historico_analise. */
interface EventoPreco {
  id: string;
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  colecao: string | null;
  grupo: string | null;
  fase: string | null;
  acao: string | null;
  preco_atacado_anterior: number | null;
  preco_atacado_novo: number | null;
  preco_varejo_anterior: number | null;
  preco_varejo_novo: number | null;
  variacao_atacado_percent: number | null;
  variacao_varejo_percent: number | null;
  delta_atacado: number | null;
  delta_varejo: number | null;
  sentido: string | null;
  ficou_invertido: boolean | null;
  alterado_por_nome: string | null;
  sem_autoria: boolean | null;
  observacao: string | null;
  criado_em: string | null;
  mes: string | null;
  espelhado_em: string | null;
}

type Severidade = "neutro" | "atencao";

/**
 * Dicionário do campo `sentido`. Fonte única dos rótulos — se a view trouxer
 * um slug novo, ele aparece cru na tela (rotulo = slug, sev = atencao).
 */
const DIC_SENTIDO: Record<string, { rotulo: string; sev: Severidade; explicacao: string }> = {
  criacao: {
    rotulo: "Criação",
    sev: "neutro",
    explicacao: "Primeiro preço do produto, não é alteração.",
  },
  aumento: {
    rotulo: "Aumento",
    sev: "atencao",
    explicacao: "Preço de atacado subiu.",
  },
  reducao: {
    rotulo: "Redução",
    sev: "atencao",
    explicacao: "Preço de atacado caiu.",
  },
  troca_varejo_atacado: {
    rotulo: "Correção de inversão",
    sev: "neutro",
    explicacao: "Varejo e atacado foram trocados entre si.",
  },
  so_varejo: {
    rotulo: "Só varejo",
    sev: "atencao",
    explicacao: "Mudou o varejo e o atacado ficou igual.",
  },
  sem_efeito: {
    rotulo: "Sem efeito",
    sev: "atencao",
    explicacao: "Gravou nova vigência sem mudar valor nenhum.",
  },
};

function sentidoInfo(slug: string | null): { rotulo: string; sev: Severidade; explicacao: string } {
  const cru = slug ?? "(vazio)";
  return DIC_SENTIDO[cru] ?? { rotulo: cru, sev: "atencao", explicacao: "Sentido novo na view, sem rótulo no dicionário." };
}

const COR_SEV: Record<Severidade, string> = {
  neutro: "hsl(var(--muted-foreground))",
  atencao: "hsl(var(--warning))",
};


type ColunaOrdem = "criado_em" | "cod_cadastro" | "variacao_atacado_percent";

const fmtBRL = (v: number | null | undefined) =>
  typeof v === "number"
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

function fmtDataHora(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const Travessao = () => <span className="text-muted-foreground">—</span>;

export function HistoricoPrecoTab() {
  const [__n_busca, __s_busca] = __uet({ busca: "" }, { prefixo: "hp", replaceKeys: ["busca"] });
  const busca: string = __n_busca.busca as string;
  const setBusca = (v: __SSA<string>) => { const x = __ra(v, busca); __s_busca({ busca: x } as never); };
  const [__n_sentido, __s_sentido] = __uet({ sentido: "todos" }, { prefixo: "hp" });
  const sentido: string = __n_sentido.sentido as string;
  const setSentido = (v: __SSA<string>) => { const x = __ra(v, sentido); __s_sentido({ sentido: x } as never); };
  const [__n_colecao, __s_colecao] = __uet({ colecao: "todas" }, { prefixo: "hp" });
  const colecao: string = __n_colecao.colecao as string;
  const setColecao = (v: __SSA<string>) => { const x = __ra(v, colecao); __s_colecao({ colecao: x } as never); };
  const [__n_grupo, __s_grupo] = __uet({ grupo: "todos" }, { prefixo: "hp" });
  const grupo: string = __n_grupo.grupo as string;
  const setGrupo = (v: __SSA<string>) => { const x = __ra(v, grupo); __s_grupo({ grupo: x } as never); };
  const [__n_mesIni, __s_mesIni] = __uet({ de: "inicio" }, { prefixo: "hp" });
  const mesIni: string = __n_mesIni.de as string;
  const setMesIni = (v: __SSA<string>) => { const x = __ra(v, mesIni); __s_mesIni({ de: x } as never); };
  const [__n_mesFim, __s_mesFim] = __uet({ ate: "fim" }, { prefixo: "hp" });
  const mesFim: string = __n_mesFim.ate as string;
  const setMesFim = (v: __SSA<string>) => { const x = __ra(v, mesFim); __s_mesFim({ ate: x } as never); };
  const [__n_ordem, __s_ordem] = __uet({ ordem: "" }, { prefixo: "hp" });
  const ordem: { coluna: ColunaOrdem; dir: "asc" | "desc" } | null = __useMemo<{ coluna: ColunaOrdem; dir: "asc" | "desc" } | null>(() => { const t = __n_ordem.ordem as string; if (!t) return null; try { return JSON.parse(t); } catch { return null; } }, [__n_ordem.ordem]);
  const setOrdem = (v: __SSA<{ coluna: ColunaOrdem; dir: "asc" | "desc" } | null>) => { const x = __ra(v, ordem); __s_ordem({ ordem: (JSON.stringify(x) === JSON.stringify(null) ? "" : JSON.stringify(x)) } as never); };
  const [__n_pagina, __s_pagina] = __uet({ pagina: 1 }, { prefixo: "hp" });
  const pagina: number = __n_pagina.pagina as number;
  const setPagina = (v: __SSA<number>) => { const x = __ra(v, pagina); __s_pagina({ pagina: x } as never); };
  const [tamanho, setTamanho] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const selecaoProduto = { colecao: lerFiltroProduto(colecao), grupo: lerFiltroProduto(grupo) };
  const filtros: FiltroLista[] = Object.entries(selecaoProduto).flatMap(([c,v]) => v.length ? [{ c, op: "in" as const, v }] : []);
  if (mesIni !== "inicio") filtros.push({ c: "mes", op: "gte", v: mesIni });
  if (mesFim !== "fim") filtros.push({ c: "mes", op: "lte", v: mesFim });
  if (sentido !== "todos") filtros.push({ c: "sentido", op: "eq", v: sentido });
  const ignorar = ["__busca__", "colecao", "grupo", "mes", "sentido"];
  const listaParams: ParamsLista = { relacao: "vw_preco_historico_analise", busca, filtros, pagina, tamanho,
    ordem: [{ c: ordem?.coluna ?? "criado_em", dir: ordem?.dir ?? "desc" }, { c: "id", dir: "asc" }],
    agregados: [
      { id: "total", fn: "count", ignorar },
      { id: "alteracoes", fn: "count", ignorar, onde: [{ c: "sentido", op: "neq", v: "criacao" }] },
      { id: "semAutoria", fn: "count", ignorar, onde: [{ c: "sem_autoria", op: "eq", v: true }] },
      { id: "invertidos", fn: "count", ignorar, onde: [{ c: "ficou_invertido", op: "eq", v: true }] },
      { id: "grafico", fn: "count", por: ["mes", "sentido"] },
      ...["colecao", "grupo", "mes"].map(c => ({ id: c, fn: "count" as const, por: [c], ignorar: c === "mes" ? ignorar : [c] })),
    ] };
  const listaQ = useListaPaginada<EventoPreco>(listaParams);
  const ag = listaQ.data?.agregados;
  const cartoes = { total: numeroAgregado(ag, "total"), alteracoes: numeroAgregado(ag, "alteracoes"), semAutoria: numeroAgregado(ag, "semAutoria"), invertidos: numeroAgregado(ag, "invertidos") };
  const opcoesDimensao = (c: string) => gruposAgregado(ag, c).filter(g => g[c] != null).map(g => ({ valor: String(g[c]), rotulo: String(g[c]), contagem: Number(g.valor ?? 0) })).sort((a,b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const opcoes = { meses: opcoesDimensao("mes").map(g => g.valor) };

  const __pg1 = __useRef(false);
  useEffect(() => { if (!__pg1.current) { __pg1.current = true; return; } setPagina(1); }, [busca, mesIni, mesFim, sentido, colecao, grupo, tamanho]);

  const totalPaginas = Math.max(1, Math.ceil((listaQ.data?.total ?? 0) / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const naPagina = listaQ.data?.linhas ?? [];

  /** Séries do gráfico: sentidos presentes no recorte, na ordem do dicionário. */
  const series = useMemo(() => {
    const presentes = new Set<string>();
    for (const e of gruposAgregado(ag, "grafico")) presentes.add(String(e.sentido ?? "(vazio)"));
    const ordenado = Object.keys(DIC_SENTIDO).filter((s) => presentes.has(s));
    for (const s of presentes) if (!ordenado.includes(s)) ordenado.push(s);
    return ordenado;
  }, [ag]);

  const dadosGrafico = useMemo(() => {
    const porMes = new Map<string, Record<string, string | number>>();
    for (const e of gruposAgregado(ag, "grafico")) {
      const mes = String(e.mes ?? "(sem mês)");
      const s = String(e.sentido ?? "(vazio)");
      const linha = porMes.get(mes) ?? { mes };
      linha[s] = Number(e.valor ?? 0);
      porMes.set(mes, linha);
    }
    return [...porMes.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  }, [ag]);

  function ordenar(coluna: ColunaOrdem) {
    setOrdem((o) =>
      o?.coluna === coluna
        ? (o.dir === "asc" ? { coluna, dir: "desc" } : null)
        : { coluna, dir: "asc" },
    );
  }

  function Seta({ coluna }: { coluna: ColunaOrdem }) {
    if (ordem?.coluna !== coluna) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return ordem.dir === "asc"
      ? <ArrowUp className="ml-1 inline h-3 w-3" />
      : <ArrowDown className="ml-1 inline h-3 w-3" />;
  }

  async function exportarCsv() {
    try {
    const recorte = await exportarLista<EventoPreco>(listaParams);
    const cabecalho = [
      "Data", "Código", "SKU", "Nome comercial", "Coleção", "Grupo", "Sentido",
      "Atacado de", "Atacado para", "Varejo de", "Varejo para",
      "Variação atacado (%)", "Variação varejo (%)", "Autor", "Observação",
    ];
    const corpo = recorte.map((e) => [
      fmtDataHora(e.criado_em) ?? "",
      e.cod_cadastro, e.sku, e.nome_comercial, e.colecao, e.grupo,
      sentidoInfo(e.sentido).rotulo,
      e.preco_atacado_anterior, e.preco_atacado_novo,
      e.preco_varejo_anterior, e.preco_varejo_novo,
      e.variacao_atacado_percent, e.variacao_varejo_percent,
      e.sem_autoria ? "indeterminado" : (e.alterado_por_nome ?? ""),
      e.observacao,
    ].map(csvCelula).join(";")).join("\n");
    const conteudo = "﻿" + cabecalho.map(csvCelula).join(";") + "\n" + corpo;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-preco-${hojeIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    } catch (error) { toast.error(formatError(error)); }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Espelho do histórico do FOP. 949 dos 1.024 registros são a carga inicial;
          a autoria só passou a ser registrada depois.
        </p>

        {listaQ.error && (
          <Card className="border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">
              {(listaQ.error as Error).message}
            </CardContent>
          </Card>
        )}

        {/* Cartões-resumo */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <div className="text-2xl font-semibold tabular-nums">{cartoes.total}</div>
              <div className="text-xs text-muted-foreground">Eventos</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-2xl font-semibold tabular-nums">{cartoes.alteracoes}</div>
              <div className="text-xs text-muted-foreground">Alterações de preço</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className="text-2xl font-semibold tabular-nums">{cartoes.semAutoria}</div>
              <div className="text-xs text-muted-foreground">
                Sem autoria — a origem não registrou quem alterou
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <div className={cn("text-2xl font-semibold tabular-nums", cartoes.invertidos > 0 && "text-destructive")}>
                {cartoes.invertidos}
              </div>
              <div className="text-xs text-muted-foreground">Deixaram o preço invertido</div>
            </CardContent>
          </Card>
        </div>

        {/* Gráfico por mês, empilhado por sentido */}
        <Card>
          <CardContent className="p-4">
            {listaQ.isLoading ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando histórico…
              </div>
            ) : dadosGrafico.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
                Sem eventos neste recorte.
              </div>
            ) : (
              <div style={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGrafico} margin={{ top: 12, right: 16, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={50} />
                    <ChartTooltip
                      formatter={(v: number, nome: string) => [v, sentidoInfo(nome).rotulo]}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12 }}
                      formatter={(v: string) => sentidoInfo(v).rotulo}
                    />
                    {series.map((s) => (
                      <Bar
                        key={s}
                        dataKey={s}
                        name={s}
                        stackId="sentidos"
                        fill={COR_SEV[sentidoInfo(s).sev]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, SKU ou nome…"
              className="pl-8"
            />
          </div>
          <Select value={mesIni} onValueChange={setMesIni}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="De" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="inicio">Desde o início</SelectItem>
              {opcoes.meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={mesFim} onValueChange={setMesFim}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Até" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fim">Até o fim</SelectItem>
              {opcoes.meses.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sentido} onValueChange={setSentido}>
            <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os sentidos</SelectItem>
              {Object.entries(DIC_SENTIDO).map(([slug, d]) => (
                <SelectItem key={slug} value={slug}>{d.rotulo}</SelectItem>
              ))}
              {series
                .filter((s) => !(s in DIC_SENTIDO))
                .map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <MultiSelectFilter label="Todas as coleções" plural="coleções" opcoes={opcoesDimensao("colecao")} selecionados={selecaoProduto.colecao} onChange={(v) => setColecao(v.length ? __el(v) : "todas")} className="w-[180px] h-10" />
          <MultiSelectFilter label="Todos os grupos" plural="grupos" opcoes={opcoesDimensao("grupo")} selecionados={selecaoProduto.grupo} onChange={(v) => setGrupo(v.length ? __el(v) : "todos")} className="w-[170px] h-10" />
          <Button variant="outline" size="sm" onClick={() => { void exportarCsv(); }} disabled={!listaQ.data?.total}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Tabela de eventos */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[calc(100vh-18rem)]">
              <Table containerClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => ordenar("criado_em")}
                    >
                      Data<Seta coluna="criado_em" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap"
                      onClick={() => ordenar("cod_cadastro")}
                    >
                      Código<Seta coluna="cod_cadastro" />
                    </TableHead>
                    <TableHead>Nome comercial</TableHead>
                    <TableHead className="whitespace-nowrap">Coleção</TableHead>
                    <TableHead className="whitespace-nowrap">Sentido</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Atacado</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Varejo</TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap text-right"
                      onClick={() => ordenar("variacao_atacado_percent")}
                    >
                      Var. atacado<Seta coluna="variacao_atacado_percent" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Autor</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Carregando histórico…
                      </TableCell>
                    </TableRow>
                  )}
                  {!listaQ.isLoading && naPagina.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        Nenhum evento neste recorte.
                      </TableCell>
                    </TableRow>
                  )}
                  {naPagina.map((e) => {
                    const info = sentidoInfo(e.sentido);
                    const variacao = e.variacao_atacado_percent;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-sm tabular-nums">
                          {fmtDataHora(e.criado_em) ?? <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {e.cod_cadastro ? (
                            <Link
                              to={`/vendas/produto/ficha/${encodeURIComponent(e.cod_cadastro)}`}
                              className="font-medium tracking-tight underline-offset-2 hover:underline"
                            >
                              {e.cod_cadastro}
                            </Link>
                          ) : <Travessao />}
                        </TableCell>
                        <TableCell className="min-w-[220px] text-sm">
                          {e.nome_comercial ?? <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {e.colecao ?? <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "cursor-default text-[11px] font-normal",
                                  info.sev === "atencao"
                                    ? "border-warning/40 bg-warning/10 text-warning"
                                    : "border-border bg-muted/50 text-muted-foreground",
                                )}
                              >
                                {info.rotulo}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{info.explicacao}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                          {fmtBRL(e.preco_atacado_anterior) ?? "—"}
                          <span className="mx-1 text-muted-foreground">→</span>
                          {fmtBRL(e.preco_atacado_novo) ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                          {fmtBRL(e.preco_varejo_anterior) ?? "—"}
                          <span className="mx-1 text-muted-foreground">→</span>
                          {fmtBRL(e.preco_varejo_novo) ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                          {typeof variacao === "number" ? (
                            <span className={cn(variacao > 0 && "text-destructive", variacao < 0 && "text-success")}>
                              {variacao > 0 ? "+" : ""}
                              {variacao.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                            </span>
                          ) : <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {e.sem_autoria ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default italic text-muted-foreground">
                                  indeterminado
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>A origem não registrou o autor.</TooltipContent>
                            </Tooltip>
                          ) : (e.alterado_por_nome ?? <Travessao />)}
                        </TableCell>
                        <TableCell className="w-8">
                          {e.observacao && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <MessageSquareText className="h-4 w-4 cursor-default text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">{e.observacao}</TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <RodapePaginacao
              total={listaQ.data?.total ?? 0}
              pagina={paginaAtual}
              tamanhoPagina={tamanho}
              tela="historico_preco"
              onPagina={setPagina}
              onTamanhoPagina={(n) => setTamanho(n as PageSizeOption)}
            />
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
