// Aba Histórico da Tabela de Preço — LEITURA PURA de vw_preco_historico_analise.
// Espelho do histórico de preços do FOP. Nenhuma escrita, nenhum botão de
// corrigir/desfazer/reverter. O dicionário de `sentido` é hardcode aqui, e só
// aqui: slug novo aparece cru, nunca escondido.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download,
  Loader2, MessageSquareText, Search,
} from "lucide-react";
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

const TAMANHOS = [50, 100, 200, 500];

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
  const [busca, setBusca] = useState("");
  const [sentido, setSentido] = useState("todos");
  const [colecao, setColecao] = useState("todas");
  const [grupo, setGrupo] = useState("todos");
  const [mesIni, setMesIni] = useState("inicio");
  const [mesFim, setMesFim] = useState("fim");
  const [ordem, setOrdem] = useState<{ coluna: ColunaOrdem; dir: "asc" | "desc" } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(100);

  const listaQ = useQuery({
    queryKey: ["preco-historico-analise"],
    queryFn: async (): Promise<EventoPreco[]> => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from("vw_preco_historico_analise")
        .select("*")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EventoPreco[];
    },
  });

  const eventos = useMemo(() => listaQ.data ?? [], [listaQ.data]);

  const opcoes = useMemo(() => {
    const cole = new Set<string>();
    const grup = new Set<string>();
    const meses = new Set<string>();
    for (const e of eventos) {
      if (e.colecao) cole.add(e.colecao);
      if (e.grupo) grup.add(e.grupo);
      if (e.mes) meses.add(e.mes);
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { colecoes: ord(cole), grupos: ord(grup), meses: [...meses].sort() };
  }, [eventos]);

  const cartoes = useMemo(() => {
    let alteracoes = 0;
    let semAutoria = 0;
    let invertidos = 0;
    for (const e of eventos) {
      if (e.sentido !== "criacao") alteracoes += 1;
      if (e.sem_autoria) semAutoria += 1;
      if (e.ficou_invertido) invertidos += 1;
    }
    return { total: eventos.length, alteracoes, semAutoria, invertidos };
  }, [eventos]);

  const recorte = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = eventos.filter((e) => {
      if (mesIni !== "inicio" && (e.mes ?? "") < mesIni) return false;
      if (mesFim !== "fim" && (e.mes ?? "") > mesFim) return false;
      if (sentido !== "todos" && e.sentido !== sentido) return false;
      if (colecao !== "todas" && e.colecao !== colecao) return false;
      if (grupo !== "todos" && e.grupo !== grupo) return false;
      if (!q) return true;
      return [e.cod_cadastro, e.sku, e.nome_comercial]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    const comparar = (a: EventoPreco, b: EventoPreco) => {
      if (!ordem) {
        return String(b.criado_em ?? "").localeCompare(String(a.criado_em ?? ""));
      }
      const mult = ordem.dir === "asc" ? 1 : -1;
      const va = a[ordem.coluna];
      const vb = b[ordem.coluna];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * mult;
      return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * mult;
    };
    return [...base].sort(comparar);
  }, [eventos, busca, mesIni, mesFim, sentido, colecao, grupo, ordem]);

  useEffect(() => { setPagina(1); }, [busca, mesIni, mesFim, sentido, colecao, grupo, tamanho]);

  const totalPaginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const naPagina = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

  /** Séries do gráfico: sentidos presentes no recorte, na ordem do dicionário. */
  const series = useMemo(() => {
    const presentes = new Set<string>();
    for (const e of recorte) presentes.add(e.sentido ?? "(vazio)");
    const ordenado = Object.keys(DIC_SENTIDO).filter((s) => presentes.has(s));
    for (const s of presentes) if (!ordenado.includes(s)) ordenado.push(s);
    return ordenado;
  }, [recorte]);

  const dadosGrafico = useMemo(() => {
    const porMes = new Map<string, Record<string, string | number>>();
    for (const e of recorte) {
      const mes = e.mes ?? "(sem mês)";
      const s = e.sentido ?? "(vazio)";
      const linha = porMes.get(mes) ?? { mes };
      linha[s] = Number(linha[s] ?? 0) + 1;
      porMes.set(mes, linha);
    }
    return [...porMes.values()].sort((a, b) => String(a.mes).localeCompare(String(b.mes)));
  }, [recorte]);

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

  function exportarCsv() {
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
          <Select value={colecao} onValueChange={setColecao}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as coleções</SelectItem>
              {opcoes.colecoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grupo} onValueChange={setGrupo}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os grupos</SelectItem>
              {opcoes.grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={recorte.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Tabela de eventos */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {recorte.length} de {eventos.length} eventos
              </span>
              <div className="flex items-center gap-2">
                <Select value={String(tamanho)} onValueChange={(v) => setTamanho(Number(v))}>
                  <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAMANHOS.map((t) => <SelectItem key={t} value={String(t)}>{t} / página</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={paginaAtual <= 1}
                  onClick={() => setPagina(paginaAtual - 1)}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums text-muted-foreground">
                  {paginaAtual} / {totalPaginas}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={paginaAtual >= totalPaginas}
                  onClick={() => setPagina(paginaAtual + 1)}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
