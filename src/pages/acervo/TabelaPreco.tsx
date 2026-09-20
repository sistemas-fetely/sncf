// Tabela de Preço (espelho) — LEITURA PURA.
// O preço é gerido pelo time comercial e vive no FOP. Esta tela não escreve
// preço em lugar nenhum: nem em sncf_produtos, nem no FOP, nem por edge
// function. O papel dela é mostrar a tabela e APONTAR incoerências.
//
// DIMENSAO-VIA-TABELA:
//  - as colunas da escada vêm de preco_faixa_desconto (ativo, ordem, rotulo);
//    os valores vêm prontos do jsonb `escada` da view, com a chave = slug.
//    Nada de desconto é recalculado aqui.
//  - os alertas vêm de preco_regra_validacao (nome, descricao, severidade);
//    a view só devolve os slugs em `alertas`.
// Nenhuma faixa, percentual, nome de regra ou severidade está escrito no código.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight,
  Download, Loader2, RefreshCw, Search, Tags,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HistoricoPrecoTab } from "@/components/acervo/HistoricoPrecoTab";

/** Linha da view vw_preco_espelho (1 por SKU). */
interface LinhaPreco {
  cod_cadastro: string | null;
  sku: string;
  nome_comercial: string | null;
  colecao: string | null;
  grupo: string | null;
  cor_nome: string | null;
  fase: string | null;
  preco_custo: number | null;
  preco_atacado: number | null;
  preco_varejo: number | null;
  margem_atacado_pct: number | null;
  varejo_sobre_atacado: number | null;
  atacado_maior_desconto: number | null;
  alertas: string[] | null;
  qtd_alertas: number | null;
  tem_critico: boolean | null;
  escada: Record<string, number | null> | null;
  atualizado_em: string | null;
}

interface Faixa {
  slug: string;
  rotulo: string;
  percentual: number | null;
  base: string | null;
  ordem: number | null;
}

interface Regra {
  slug: string;
  nome: string;
  descricao: string | null;
  severidade: string | null;
  ordem: number | null;
}

const TAMANHOS = [50, 100, 200, 500];

type ColunaOrdem = "cod_cadastro" | "nome_comercial" | "preco_varejo" | "preco_atacado" | "margem_atacado_pct";

const fmtBRL = (v: number | null | undefined) =>
  typeof v === "number" && v !== 0
    ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

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

export default function TabelaPreco() {
  const [busca, setBusca] = useState("");
  const [colecao, setColecao] = useState("todas");
  const [grupo, setGrupo] = useState("todos");
  const [fase, setFase] = useState("todas");
  /** "todos" | "com_alerta" | "criticos" | slug de uma regra */
  const [alerta, setAlerta] = useState("todos");
  const [ordem, setOrdem] = useState<{ coluna: ColunaOrdem; dir: "asc" | "desc" } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState(100);

  const faixasQ = useQuery({
    queryKey: ["preco-faixas"],
    queryFn: async (): Promise<Faixa[]> => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from("preco_faixa_desconto")
        .select("slug, rotulo, percentual, base, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Faixa[];
    },
  });

  const regrasQ = useQuery({
    queryKey: ["preco-regras"],
    queryFn: async (): Promise<Regra[]> => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from("preco_regra_validacao")
        .select("slug, nome, descricao, severidade, ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Regra[];
    },
  });

  const listaQ = useQuery({
    queryKey: ["preco-espelho"],
    queryFn: async (): Promise<LinhaPreco[]> => {
      const { data, error } = await (supabase as unknown as SupabaseClient)
        .from("vw_preco_espelho")
        .select("*")
        .order("cod_cadastro", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaPreco[];
    },
  });

  const linhas = useMemo(() => listaQ.data ?? [], [listaQ.data]);
  const faixas = useMemo(() => faixasQ.data ?? [], [faixasQ.data]);
  const regras = useMemo(() => regrasQ.data ?? [], [regrasQ.data]);

  const regraPorSlug = useMemo(() => {
    const m = new Map<string, Regra>();
    for (const r of regras) m.set(r.slug, r);
    return m;
  }, [regras]);

  const ehCritico = useCallback(
    (l: LinhaPreco) => (l.alertas ?? []).some((s) => regraPorSlug.get(s)?.severidade === "critico"),
    [regraPorSlug],
  );

  const opcoes = useMemo(() => {
    const cole = new Set<string>();
    const grup = new Set<string>();
    const fas = new Set<string>();
    for (const l of linhas) {
      if (l.colecao) cole.add(l.colecao);
      if (l.grupo) grup.add(l.grupo);
      if (l.fase) fas.add(l.fase);
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { colecoes: ord(cole), grupos: ord(grup), fases: ord(fas) };
  }, [linhas]);

  /** Recorte sem o filtro de alerta — base dos contadores clicáveis. */
  const baseSemAlerta = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (colecao !== "todas" && l.colecao !== colecao) return false;
      if (grupo !== "todos" && l.grupo !== grupo) return false;
      if (fase !== "todas" && l.fase !== fase) return false;
      if (!q) return true;
      return [l.cod_cadastro, l.sku, l.nome_comercial, l.colecao, l.cor_nome]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [linhas, busca, colecao, grupo, fase]);

  const contadores = useMemo(() => {
    let comAlerta = 0;
    let criticos = 0;
    const porRegra = new Map<string, number>();
    for (const l of baseSemAlerta) {
      const as = l.alertas ?? [];
      if (as.length > 0) comAlerta += 1;
      if (ehCritico(l)) criticos += 1;
      for (const s of as) porRegra.set(s, (porRegra.get(s) ?? 0) + 1);
    }
    return { total: baseSemAlerta.length, comAlerta, criticos, porRegra };
  }, [baseSemAlerta, ehCritico]);

  const recorte = useMemo(() => {
    let base = baseSemAlerta;
    if (alerta === "com_alerta") base = base.filter((l) => (l.alertas ?? []).length > 0);
    else if (alerta === "criticos") base = base.filter(ehCritico);
    else if (alerta !== "todos") base = base.filter((l) => (l.alertas ?? []).includes(alerta));

    const comparar = (a: LinhaPreco, b: LinhaPreco) => {
      if (!ordem) {
        // Padrão: críticos primeiro, depois cod_cadastro.
        const ca = ehCritico(a) ? 0 : 1;
        const cb = ehCritico(b) ? 0 : 1;
        if (ca !== cb) return ca - cb;
        return String(a.cod_cadastro ?? "").localeCompare(String(b.cod_cadastro ?? ""), "pt-BR", { numeric: true });
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
  }, [baseSemAlerta, alerta, ordem, ehCritico]);

  useEffect(() => { setPagina(1); }, [busca, colecao, grupo, fase, alerta, tamanho]);

  const totalPaginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const naPagina = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);

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
      "Código", "SKU", "Nome comercial", "Coleção", "Cor", "Preço custo", "Preço varejo",
      ...faixas.map((f) => f.rotulo),
      "Margem atacado (%)", "Alertas",
    ];
    const corpo = recorte.map((l) => {
      const nomesAlertas = (l.alertas ?? []).map((s) => regraPorSlug.get(s)?.nome ?? s).join(";");
      return [
        l.cod_cadastro, l.sku, l.nome_comercial, l.colecao, l.cor_nome,
        l.preco_custo, l.preco_varejo,
        ...faixas.map((f) => l.escada?.[f.slug] ?? ""),
        l.margem_atacado_pct,
        nomesAlertas,
      ].map(csvCelula).join(";");
    }).join("\n");
    const conteudo = "\uFEFF" + cabecalho.map(csvCelula).join(";") + "\n" + corpo;
    const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabela-preco-espelho-${hojeIso()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const erro = listaQ.error ?? faixasQ.error ?? regrasQ.error;

  return (
    <TooltipProvider delayDuration={200}>
      <PageShell>
        <PageHeader
          titulo="Tabela de Preço"
          icone={Tags}
          estado="Espelho do FOP — leitura. O preço é gerido pelo time comercial."
          acoes={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportarCsv} disabled={recorte.length === 0}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void listaQ.refetch(); }}
                disabled={listaQ.isFetching}
              >
                {listaQ.isFetching
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Atualizar
              </Button>
            </div>
          }
        />

        {erro && (
          <Card className="border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">
              {(erro as Error).message}
            </CardContent>
          </Card>
        )}

        {/* Resumo clicável: total, com alerta, críticos e uma pílula por regra com ocorrência. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={alerta === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => setAlerta("todos")}
          >
            Total <span className="ml-1.5 tabular-nums">{contadores.total}</span>
          </Button>
          <Button
            variant={alerta === "com_alerta" ? "default" : "outline"}
            size="sm"
            onClick={() => setAlerta("com_alerta")}
          >
            Com alerta <span className="ml-1.5 tabular-nums">{contadores.comAlerta}</span>
          </Button>
          <Button
            variant={alerta === "criticos" ? "default" : "outline"}
            size="sm"
            onClick={() => setAlerta("criticos")}
            className={alerta === "criticos" ? undefined : "border-destructive/40 text-destructive"}
          >
            Críticos <span className="ml-1.5 tabular-nums">{contadores.criticos}</span>
          </Button>
          <span className="mx-1 h-5 w-px bg-border" />
          {regras
            .filter((r) => (contadores.porRegra.get(r.slug) ?? 0) > 0)
            .map((r) => (
              <Tooltip key={r.slug}>
                <TooltipTrigger asChild>
                  <Button
                    variant={alerta === r.slug ? "default" : "outline"}
                    size="sm"
                    onClick={() => setAlerta(r.slug)}
                    className={cn(
                      alerta === r.slug
                        ? undefined
                        : r.severidade === "critico"
                          ? "border-destructive/40 text-destructive"
                          : "border-warning/40 text-warning",
                    )}
                  >
                    {r.nome} <span className="ml-1.5 tabular-nums">{contadores.porRegra.get(r.slug)}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">{r.descricao ?? r.nome}</TooltipContent>
              </Tooltip>
            ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por código, SKU, nome, coleção ou cor…"
              className="pl-8"
            />
          </div>
          <Select value={colecao} onValueChange={setColecao}>
            <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as coleções</SelectItem>
              {opcoes.colecoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={grupo} onValueChange={setGrupo}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os grupos</SelectItem>
              {opcoes.grupos.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fase} onValueChange={setFase}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as fases</SelectItem>
              {opcoes.fases.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={alerta} onValueChange={setAlerta}>
            <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os produtos</SelectItem>
              <SelectItem value="com_alerta">Só com alerta</SelectItem>
              <SelectItem value="criticos">Só críticos</SelectItem>
              {regras.map((r) => <SelectItem key={r.slug} value={r.slug}>{r.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none whitespace-nowrap" onClick={() => ordenar("cod_cadastro")}>
                      Código<Seta coluna="cod_cadastro" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">SKU</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => ordenar("nome_comercial")}>
                      Nome comercial<Seta coluna="nome_comercial" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Coleção</TableHead>
                    <TableHead className="whitespace-nowrap">Cor</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Custo</TableHead>
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap text-right"
                      onClick={() => ordenar("preco_varejo")}
                    >
                      Varejo<Seta coluna="preco_varejo" />
                    </TableHead>
                    {faixas.map((f) => {
                      const base = Number(f.percentual ?? 0) === 0;
                      return (
                        <TableHead
                          key={f.slug}
                          className={cn(
                            "whitespace-nowrap text-right",
                            base && "cursor-pointer select-none bg-muted font-medium text-foreground",
                          )}
                          onClick={base ? () => ordenar("preco_atacado") : undefined}
                        >
                          {f.rotulo}
                          {base && <Seta coluna="preco_atacado" />}
                        </TableHead>
                      );
                    })}
                    <TableHead
                      className="cursor-pointer select-none whitespace-nowrap text-right"
                      onClick={() => ordenar("margem_atacado_pct")}
                    >
                      Margem atacado<Seta coluna="margem_atacado_pct" />
                    </TableHead>
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listaQ.isLoading && (
                    <TableRow>
                      <TableCell colSpan={9 + faixas.length} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Carregando tabela…
                      </TableCell>
                    </TableRow>
                  )}
                  {!listaQ.isLoading && naPagina.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9 + faixas.length} className="py-10 text-center text-muted-foreground">
                        Nenhum produto neste recorte.
                      </TableCell>
                    </TableRow>
                  )}
                  {naPagina.map((l) => {
                    const critico = ehCritico(l);
                    return (
                      <TableRow
                        key={l.sku}
                        className={cn(critico && "border-l-2 border-l-destructive bg-destructive/5")}
                      >
                        <TableCell className="whitespace-nowrap">
                          {l.cod_cadastro ? (
                            <Link
                              to={`/vendas/produto/ficha/${encodeURIComponent(l.cod_cadastro)}`}
                              className="font-medium tracking-tight underline-offset-2 hover:underline"
                            >
                              {l.cod_cadastro}
                            </Link>
                          ) : <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{l.sku}</TableCell>
                        <TableCell className="min-w-[260px] text-sm">{l.nome_comercial ?? <Travessao />}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{l.colecao ?? <Travessao />}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{l.cor_nome ?? <Travessao />}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {fmtBRL(l.preco_custo) ?? <Travessao />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {fmtBRL(l.preco_varejo) ?? <Travessao />}
                        </TableCell>
                        {faixas.map((f) => {
                          const base = Number(f.percentual ?? 0) === 0;
                          const v = l.escada?.[f.slug] ?? null;
                          return (
                            <TableCell
                              key={f.slug}
                              className={cn(
                                "whitespace-nowrap text-right tabular-nums",
                                base && "bg-muted/50 font-medium",
                              )}
                            >
                              {fmtBRL(typeof v === "number" ? v : null) ?? <Travessao />}
                            </TableCell>
                          );
                        })}
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {typeof l.margem_atacado_pct === "number"
                            ? `${l.margem_atacado_pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                            : <Travessao />}
                        </TableCell>
                        <TableCell>
                          {(l.alertas ?? []).length === 0 ? <Travessao /> : (
                            <div className="flex flex-wrap items-center gap-1">
                              {(l.alertas ?? []).map((slug) => {
                                const r = regraPorSlug.get(slug);
                                const crit = r?.severidade === "critico";
                                return (
                                  <Tooltip key={slug}>
                                    <TooltipTrigger asChild>
                                      <Badge
                                        variant="outline"
                                        className={cn(
                                          "cursor-default text-[11px] font-normal",
                                          crit
                                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                                            : "border-warning/40 bg-warning/10 text-warning",
                                        )}
                                      >
                                        {crit && <AlertTriangle className="mr-1 h-3 w-3" />}
                                        {r?.nome ?? slug}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      {r?.descricao ?? "Regra não encontrada em preco_regra_validacao."}
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })}
                            </div>
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
                {recorte.length} de {linhas.length} produtos
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

        <p className="text-xs text-muted-foreground">
          Margem calculada sobre o custo registrado no cadastro. Confira o que esse custo representa
          antes de usar como base de decisão.
        </p>
      </PageShell>
    </TooltipProvider>
  );
}
