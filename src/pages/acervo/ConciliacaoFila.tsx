import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight,
  Download, GitCompare, RefreshCw, Search,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { fmtData } from "@/lib/data";
import {
  DeParaConciliacao, tomGravidade, temValor,
  type ConcLinha, type ImpactoDim, type RegraDiv,
} from "@/components/acervo/DeParaConciliacao";

/**
 * CONCILIAÇÃO DE CADASTRO (23/09/2026) — fila de trabalho, somente leitura.
 *
 * Uma linha = um produto × uma regra de divergência. A Mesa do Produto ficou de
 * gestão (fase, promover, voltar); aqui mora o roteiro de correção, com o "onde
 * resolver" na frente. Nada de lista de regra, impacto ou sistema escrita no
 * código: tudo vem de `vw_conciliacao_fila` e `divergencia_impacto_dim`.
 */
type FilaLinha = {
  cod_cadastro: string | null; sku: string; nome_comercial: string | null;
  colecao: string | null; grupo: string | null; fase: string | null;
  regra: string; regra_nome: string | null; sistema: string | null;
  impacto: string | null; impacto_nome: string | null; gravidade: number | null;
  onde_resolver: string | null; rota_resolver: string | null;
  consequencia: string | null; o_que_fazer: string | null;
  campo_matriz: string | null; valor_matriz: string | null;
  campo_destino: string | null; valor_destino: string | null;
  bling_codigo: string | null; xpm_codigo: string | null; handle: string | null;
  qtd_divergencias: number | null;
};

type Grupo = "onde" | "impacto" | "regra" | "fase" | "colecao";
const PARAMS: Grupo[] = ["onde", "impacto", "regra", "fase", "colecao"];

const tomCardImpacto = (gravidade: number | null | undefined, contagem: number) =>
  contagem === 0 ? ""
  : (gravidade ?? 0) >= 90 ? "border-destructive/50"
  : (gravidade ?? 0) >= 60 ? "border-warning/50"
  : "";

const tomNumeroImpacto = (gravidade: number | null | undefined, contagem: number) =>
  contagem === 0 ? "text-foreground"
  : (gravidade ?? 0) >= 90 ? "text-destructive-strong"
  : (gravidade ?? 0) >= 60 ? "text-warning-strong"
  : "text-foreground";

type ColDef = { key: keyof FilaLinha | "onde" | "matriz" | "destino"; rotulo: string; ordenavel?: boolean };
const COLUNAS: ColDef[] = [
  { key: "cod_cadastro", rotulo: "Cód. cadastro", ordenavel: true },
  { key: "sku", rotulo: "SKU", ordenavel: true },
  { key: "nome_comercial", rotulo: "Nome", ordenavel: true },
  { key: "fase", rotulo: "Fase", ordenavel: true },
  { key: "regra", rotulo: "Regra", ordenavel: true },
  { key: "impacto", rotulo: "Impacto", ordenavel: true },
  { key: "matriz", rotulo: "Matriz", ordenavel: true },
  { key: "destino", rotulo: "Destino", ordenavel: true },
  { key: "onde", rotulo: "Onde resolver", ordenavel: true },
  { key: "o_que_fazer", rotulo: "O que fazer" },
];

/** Valor usado na ordenação — vazio sempre vai para o fim, nos dois sentidos. */
function chaveOrdem(l: FilaLinha, coluna: string): string | number | null {
  if (coluna === "matriz") return l.valor_matriz;
  if (coluna === "destino") return l.valor_destino;
  if (coluna === "onde") return l.onde_resolver;
  if (coluna === "regra") return l.regra_nome ?? l.regra;
  if (coluna === "impacto") return l.gravidade;
  return (l as unknown as Record<string, string | number | null>)[coluna] ?? null;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function FiltroFacetado({ label, opcoes, selecionados, onChange }: { label: string; opcoes: { valor: string; rotulo: string; contagem: number }[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{opcoes.map(o => <Button key={o.valor} variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal" onClick={() => onChange(selecionados.includes(o.valor) ? selecionados.filter(v => v !== o.valor) : [...selecionados, o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border", selecionados.includes(o.valor) && "border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor) && <Check className="h-3 w-3" />}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>{selecionados.length > 0 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

/** De-para do produto, carregado sob demanda ao expandir a linha. */
function DeParaSobDemanda({ sku, regras, impactos }: { sku: string; regras: Map<string, RegraDiv>; impactos: Map<string, ImpactoDim> }) {
  const q = useQuery({
    queryKey: ["conciliacao-fila-360", sku],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_produto_conciliacao_360" as never).select("*").eq("sku", sku).maybeSingle();
      if (error) throw error;
      return (data ?? null) as ConcLinha | null;
    },
  });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.error) return <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar o de-para de {sku}. Detalhe: {(q.error as Error).message}</AlertDescription></Alert>;
  if (!q.data) return <p className="text-xs text-muted-foreground">Nenhuma conciliação encontrada para {sku}.</p>;
  return <DeParaConciliacao l={q.data} regras={regras} impactos={impactos} />;
}

export default function ConciliacaoFila() {
  const [sp, setSp] = useSearchParams();
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [ordem, setOrdem] = useState<{ coluna: string; dir: "asc" | "desc" }>({ coluna: "impacto", dir: "desc" });

  // FILTRO-MORA-NA-URL: a Mesa e o resto do sistema linkam já filtrado.
  // Ao abrir sem nenhum parâmetro, a fila nasce no recorte que importa: fase ativo.
  useEffect(() => {
    const temAlgum = [...PARAMS, "q"].some(k => sp.get(k) !== null);
    if (!temAlgum) {
      const novo = new URLSearchParams(sp);
      novo.set("fase", "ativo");
      setSp(novo, { replace: true });
    }
  // roda só na entrada da tela
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = (k: Grupo) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const busca = sp.get("q") ?? "";
  function setLista(k: Grupo, vs: string[]) {
    const novo = new URLSearchParams(sp);
    if (vs.length) novo.set(k, vs.join(",")); else novo.delete(k);
    setSp(novo, { replace: true });
  }
  function setBusca(v: string) {
    const novo = new URLSearchParams(sp);
    if (v) novo.set("q", v); else novo.delete("q");
    setSp(novo, { replace: true });
  }
  function limpar() { setSp(new URLSearchParams(), { replace: true }); }

  const fila = useQuery({
    queryKey: ["conciliacao-fila"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_conciliacao_fila" as never).select("*");
      if (error) throw error;
      return (data ?? []) as FilaLinha[];
    },
  });
  const impactosDim = useQuery({
    queryKey: ["divergencia-impacto-dim"],
    queryFn: async () => {
      const { data, error } = await supabase.from("divergencia_impacto_dim" as never).select("slug, nome, descricao, gravidade, ordem").order("ordem");
      if (error) throw error;
      return (data ?? []) as ImpactoDim[];
    },
  });
  const regrasDim = useQuery({
    queryKey: ["divergencia-regra"],
    queryFn: async () => {
      const { data, error } = await supabase.from("divergencia_regra" as never).select("slug, nome, sistema, impacto, consequencia, o_que_fazer, onde_resolver, ordem, rota_resolver, campo_matriz, campo_destino").order("ordem");
      if (error) throw error;
      return (data ?? []) as RegraDiv[];
    },
  });

  const carregando = fila.isLoading || impactosDim.isLoading || regrasDim.isLoading;
  const erro = fila.error ?? impactosDim.error ?? regrasDim.error;
  const atualizando = fila.isFetching || impactosDim.isFetching || regrasDim.isFetching;

  const regraPorSlug = useMemo(() => new Map((regrasDim.data ?? []).map(r => [r.slug, r])), [regrasDim.data]);
  const impactoPorSlug = useMemo(() => new Map((impactosDim.data ?? []).map(i => [i.slug, i])), [impactosDim.data]);
  const linhas = fila.data ?? [];

  const aplica = (l: FilaLinha, ignorar?: Grupo) => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (q && ![l.cod_cadastro, l.sku, l.nome_comercial].filter(temValor).some(v => String(v).toLocaleLowerCase("pt-BR").includes(q))) return false;
    for (const g of PARAMS) {
      if (g === ignorar) continue;
      const sel = lista(g);
      if (!sel.length) continue;
      const v = g === "onde" ? l.onde_resolver : g === "impacto" ? l.impacto : g === "regra" ? l.regra : g === "fase" ? l.fase : l.colecao;
      if (!sel.includes(String(v ?? "__sem__"))) return false;
    }
    return true;
  };

  const recorte = useMemo(() => {
    const base = linhas.filter(l => aplica(l));
    const mult = ordem.dir === "asc" ? 1 : -1;
    return [...base].sort((a, b) => {
      const va = chaveOrdem(a, ordem.coluna), vb = chaveOrdem(b, ordem.coluna);
      const vazioA = va === null || va === undefined || String(va).trim() === "";
      const vazioB = vb === null || vb === undefined || String(vb).trim() === "";
      if (vazioA && vazioB) return 0;
      if (vazioA) return 1;
      if (vazioB) return -1;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      if (cmp !== 0) return cmp * mult;
      return String(a.cod_cadastro ?? "").localeCompare(String(b.cod_cadastro ?? ""), "pt-BR", { numeric: true });
    });
  // aplica depende dos parâmetros da URL, que entram na dependência via `sp`
  }, [linhas, ordem, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPagina(1); setExpandido(null); }, [sp, tamanho]);

  // INDICADOR-POR-ONDE-RESOLVE: um card por sistema de destino presente na view.
  // Cor pela maior gravidade do grupo, com a mesma regra da Mesa; zero é neutro.
  const cards = useMemo(() => {
    const base = linhas.filter(l => aplica(l, "onde"));
    const mapa = new Map<string, FilaLinha[]>();
    for (const l of base) {
      const k = l.onde_resolver ?? "__sem__";
      mapa.set(k, [...(mapa.get(k) ?? []), l]);
    }
    for (const l of linhas) {
      const k = l.onde_resolver ?? "__sem__";
      if (!mapa.has(k)) mapa.set(k, []);
    }
    return [...mapa.entries()].map(([onde, ls]) => {
      const gravidade = ls.reduce((m, l) => Math.max(m, l.gravidade ?? 0), 0);
      const porImpacto = new Map<string, { nome: string; n: number; g: number }>();
      for (const l of ls) {
        const slug = l.impacto ?? "__sem__";
        const atual = porImpacto.get(slug);
        porImpacto.set(slug, { nome: l.impacto_nome ?? slug, n: (atual?.n ?? 0) + 1, g: l.gravidade ?? 0 });
      }
      const quebra = [...porImpacto.values()].sort((a, b) => b.g - a.g).map(x => `${x.n} ${x.nome.toLocaleLowerCase("pt-BR")}`).join(" · ");
      return { onde, label: onde === "__sem__" ? "Sem destino" : onde, n: ls.length, gravidade, quebra };
    }).sort((a, b) => b.gravidade - a.gravidade || a.label.localeCompare(b.label, "pt-BR"));
  // aplica depende dos parâmetros da URL
  }, [linhas, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const facet = (g: Grupo, ops: { valor: string; rotulo: string }[], chave: (l: FilaLinha) => string) =>
    ops.map(o => ({ ...o, contagem: linhas.filter(l => aplica(l, g) && chave(l) === o.valor).length }));

  const opcoesOnde = useMemo(() => [...new Set(linhas.map(l => l.onde_resolver ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem destino" : v })), [linhas]);
  const opcoesImpacto = useMemo(() => {
    const presentes = new Set(linhas.map(l => l.impacto ?? "__sem__"));
    return [...(impactosDim.data ?? [])].filter(i => presentes.has(i.slug)).sort((a, b) => (b.gravidade ?? 0) - (a.gravidade ?? 0) || (a.ordem ?? 999) - (b.ordem ?? 999)).map(i => ({ valor: i.slug, rotulo: i.nome }));
  }, [linhas, impactosDim.data]);
  const opcoesRegra = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (!m.has(l.regra)) m.set(l.regra, l.regra_nome ?? l.regra);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [linhas]);
  const opcoesFase = useMemo(() => [...new Set(linhas.map(l => l.fase ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem fase" : v })), [linhas]);
  const opcoesColecao = useMemo(() => [...new Set(linhas.map(l => l.colecao ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem coleção" : v })), [linhas]);

  const filtrosAtivos = (busca ? 1 : 0) + PARAMS.reduce((n, g) => n + lista(g).length, 0);
  const paginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, paginas);
  const paginaLinhas = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  const produtos = new Set(recorte.map(l => l.sku)).size;
  const estado = carregando ? "Carregando divergências…" : `${recorte.length} divergência(s) · ${produtos} produto(s)`;

  function ordenar(key: string) {
    setOrdem(o => o.coluna === key ? { coluna: key, dir: o.dir === "asc" ? "desc" : "asc" } : { coluna: key, dir: "asc" });
  }

  function exportar() {
    const cab = ["Cód. cadastro", "SKU", "Nome", "Fase", "Coleção", "Regra", "Impacto", "Gravidade", "Campo matriz", "Valor matriz", "Campo destino", "Valor destino", "Onde resolver", "Consequência", "O que fazer"];
    const corpo = recorte.map(l => [
      l.cod_cadastro, l.sku, l.nome_comercial, l.fase, l.colecao, l.regra_nome ?? l.regra,
      l.impacto_nome ?? l.impacto, l.gravidade, l.campo_matriz, l.valor_matriz,
      l.campo_destino, l.valor_destino, l.onde_resolver, l.consequencia, l.o_que_fazer,
    ].map(csvCelula).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + cab.map(csvCelula).join(";") + "\n" + corpo], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacao-cadastro-${fmtData(new Date(), "").split("/").reverse().join("-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const celulaVazia = <span className="text-muted-foreground">—</span>;

  function celula(l: FilaLinha, c: ColDef) {
    if (c.key === "cod_cadastro") return l.cod_cadastro
      ? <Link to={`/vendas/produto/ficha/${encodeURIComponent(l.cod_cadastro)}`} className="font-medium hover:underline">{l.cod_cadastro}</Link>
      : celulaVazia;
    if (c.key === "sku") return <span>{l.sku}</span>;
    if (c.key === "nome_comercial") return <span className="block max-w-56 truncate">{l.nome_comercial ?? "—"}</span>;
    if (c.key === "fase") return <Badge variant="outline" className="font-normal">{l.fase ?? "—"}</Badge>;
    if (c.key === "regra") return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className={cn("font-normal", tomGravidade(l.gravidade))}>{l.regra_nome ?? l.regra}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{l.consequencia ?? (l.regra_nome ?? l.regra)}</TooltipContent></Tooltip>;
    if (c.key === "impacto") return <span>{l.impacto_nome ?? l.impacto ?? "—"}</span>;
    if (c.key === "matriz" || c.key === "destino") {
      const campo = c.key === "matriz" ? l.campo_matriz : l.campo_destino;
      const valor = c.key === "matriz" ? l.valor_matriz : l.valor_destino;
      if (!temValor(campo) && !temValor(valor)) return celulaVazia;
      return <span className="block max-w-48"><span className="block truncate">{temValor(valor) ? String(valor) : "—"}</span>{temValor(campo) && <span className="block truncate text-[10px] text-muted-foreground">{campo}</span>}</span>;
    }
    if (c.key === "onde") {
      if (temValor(l.rota_resolver)) return <Link to={String(l.rota_resolver)} className="hover:underline">Resolver no SNCF →</Link>;
      return <span className="text-muted-foreground">no {l.onde_resolver ?? "—"}</span>;
    }
    if (!temValor(l.o_que_fazer)) return celulaVazia;
    return <Tooltip><TooltipTrigger asChild><span className="block max-w-64 truncate text-left">{l.o_que_fazer}</span></TooltipTrigger><TooltipContent className="max-w-sm">{l.o_que_fazer}</TooltipContent></Tooltip>;
  }

  return <TooltipProvider delayDuration={200}><PageShell>
    <PageHeader
      titulo="Conciliação de Cadastro"
      icone={GitCompare}
      estado={estado}
      acoes={<>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!recorte.length}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        <Button size="sm" disabled={atualizando} onClick={async () => { await Promise.all([fila.refetch(), impactosDim.refetch(), regrasDim.refetch()]); }}><RefreshCw className={cn("mr-2 h-4 w-4", atualizando && "animate-spin")} />Atualizar</Button>
      </>}
    />

    {erro && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar a fila de conciliação. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}

    <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicadores por onde resolver">
      {carregando ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />) : cards.map(c => {
        const selecionado = lista("onde").includes(c.onde);
        const botao = <Button
          variant="outline"
          className={cn("h-20 items-start justify-center border p-3 text-left", tomCardImpacto(c.gravidade, c.n), selecionado && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
          onClick={() => setLista("onde", selecionado ? [] : [c.onde])}
        >
          <span className="flex w-full flex-col">
            <span className="text-[11px] font-normal text-muted-foreground">{c.label}</span>
            <span className={cn("mt-1 text-[21px] font-medium tabular-nums", tomNumeroImpacto(c.gravidade, c.n))}>{c.n}</span>
          </span>
        </Button>;
        return <Tooltip key={c.onde}><TooltipTrigger asChild>{botao}</TooltipTrigger><TooltipContent className="max-w-xs">{c.quebra || "Nenhuma divergência neste recorte."}</TooltipContent></Tooltip>;
      })}
    </section>

    <section className="flex flex-wrap items-center gap-2 border-y py-3">
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU ou nome" />
      </div>
      <FiltroFacetado label="Onde resolver" selecionados={lista("onde")} onChange={v => setLista("onde", v)} opcoes={facet("onde", opcoesOnde, l => l.onde_resolver ?? "__sem__")} />
      <FiltroFacetado label="Impacto" selecionados={lista("impacto")} onChange={v => setLista("impacto", v)} opcoes={facet("impacto", opcoesImpacto, l => l.impacto ?? "__sem__")} />
      <FiltroFacetado label="Regra" selecionados={lista("regra")} onChange={v => setLista("regra", v)} opcoes={facet("regra", opcoesRegra, l => l.regra)} />
      <FiltroFacetado label="Fase" selecionados={lista("fase")} onChange={v => setLista("fase", v)} opcoes={facet("fase", opcoesFase, l => l.fase ?? "__sem__")} />
      <FiltroFacetado label="Coleção" selecionados={lista("colecao")} onChange={v => setLista("colecao", v)} opcoes={facet("colecao", opcoesColecao, l => l.colecao ?? "__sem__")} />
      {filtrosAtivos > 0 && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}
    </section>

    {carregando ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
    : recorte.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhuma divergência neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>
    : <div className="overflow-hidden rounded-md border bg-card">
      <Table className="text-xs" containerClassName="max-h-[min(62vh,46rem)]">
        <TableHeader><TableRow>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted" />
          {COLUNAS.map(c => <TableHead key={String(c.key)} className="sticky top-0 z-40 whitespace-nowrap bg-muted font-medium" aria-sort={ordem.coluna === c.key ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
            {c.ordenavel ? <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => ordenar(String(c.key))}>{c.rotulo}{ordem.coluna !== c.key ? <ArrowUpDown className="ml-1 h-3 w-3" /> : ordem.dir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />}</Button> : c.rotulo}
          </TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{paginaLinhas.map(l => <Fragment key={`${l.sku}|${l.regra}`}>
          <TableRow className="border-b">
            <TableCell className="py-2.5 align-top">
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido === l.sku ? `Recolher ${l.sku}` : `Expandir ${l.sku}`} onClick={() => setExpandido(e => e === l.sku ? null : l.sku)}>
                {expandido === l.sku ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </TableCell>
            {COLUNAS.map(c => <TableCell key={String(c.key)} className="py-2.5 align-top">{celula(l, c)}</TableCell>)}
          </TableRow>
          {expandido === l.sku && <TableRow><TableCell colSpan={COLUNAS.length + 1} className="bg-muted/30 p-4">
            <DeParaSobDemanda sku={l.sku} regras={regraPorSlug} impactos={impactoPorSlug} />
          </TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table>
      <RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="conciliacao_cadastro" onPagina={setPagina} onTamanhoPagina={setTamanho} />
    </div>}
  </PageShell></TooltipProvider>;
}
