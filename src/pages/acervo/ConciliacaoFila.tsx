import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight,
  Download, GitCompare, RefreshCw, Search, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RodapePaginacao, DEFAULT_PAGE_SIZE } from "@/components/tabela/RodapePaginacao";
import { fmtData } from "@/lib/data";
import { temValor } from "@/components/acervo/DeParaConciliacao";
import { PlanilhaPendencias } from "@/components/acervo/PlanilhaPendencias";
import { VoltarFaseLote, type ProdutoLote } from "@/components/acervo/VoltarFaseLote";
import { CorrigirXpmLote, type ProdutoXpm } from "@/components/acervo/CorrigirXpmLote";
import { CorrigirBlingLote } from "@/components/acervo/CorrigirBlingLote";

/** Regra de cadastro incompleto — única que o ciclo de planilha resolve. */
const REGRA_INCOMPLETO = "sncf_ativo_incompleto";

/**
 * CONCILIAÇÃO DE CADASTRO (23/09/2026) — fila de trabalho, somente leitura.
 *
 * Uma linha = um produto × uma regra de divergência. A Mesa do Produto ficou de
 * gestão (fase, promover, voltar); aqui mora o roteiro de correção, com o "onde
 * resolver" na frente. Nada de lista de regra ou sistema escrita no código:
 * tudo vem de `vw_conciliacao_fila` e `divergencia_regra`.
 */
type FilaLinha = {
  linha_id: string;
  cod_cadastro: string | null; sku: string; nome_comercial: string | null;
  colecao: string | null; grupo: string | null; fase: string | null;
  regra: string; regra_nome: string | null; sistema: string | null;
  camada: string | null; camada_nome: string | null; camada_ordem: number | null;
  onde_resolver: string | null; rota_resolver: string | null;
  consequencia: string | null; o_que_fazer: string | null;
  campo_matriz: string | null; valor_matriz: string | null;
  campo_destino: string | null; valor_destino: string | null;
  bling_codigo: string | null; xpm_codigo: string | null; handle: string | null;
  qtd_divergencias: number | null;
};

type Grupo = "camada" | "onde" | "regra" | "fase" | "colecao";
const PARAMS: Grupo[] = ["camada", "onde", "regra", "fase", "colecao"];

type ColDef = { key: keyof FilaLinha | "onde" | "matriz" | "destino"; rotulo: string; ordenavel?: boolean };
const COLUNAS: ColDef[] = [
  { key: "cod_cadastro", rotulo: "Cód. cadastro", ordenavel: true },
  { key: "sku", rotulo: "SKU", ordenavel: true },
  { key: "nome_comercial", rotulo: "Nome", ordenavel: true },
  { key: "fase", rotulo: "Fase", ordenavel: true },
  { key: "regra", rotulo: "Regra", ordenavel: true },
  { key: "camada_nome", rotulo: "Camada", ordenavel: true },
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
  if (coluna === "camada_nome") return l.camada_ordem;
  return (l as unknown as Record<string, string | number | null>)[coluna] ?? null;
}

function csvCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join("; ") : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function FiltroFacetado({ label, opcoes, selecionados, onChange }: { label: string; opcoes: { valor: string; rotulo: string; contagem: number }[]; selecionados: string[]; onChange: (v: string[]) => void }) {
  const visiveis = opcoes.filter(o => o.contagem > 0 || selecionados.includes(o.valor));
  return <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="gap-2 font-normal"><span className="text-muted-foreground">{label}</span>{selecionados.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{selecionados.length}</Badge>}<ChevronDown className="h-3.5 w-3.5 opacity-50" /></Button></PopoverTrigger><PopoverContent align="start" className="w-64 p-1"><div className="max-h-72 overflow-auto">{visiveis.length === 0 ? <p className="px-2 py-1.5 text-sm text-muted-foreground">Nada neste recorte</p> : visiveis.map(o => <Button key={o.valor} variant="ghost" size="sm" className="w-full justify-start gap-2 font-normal" onClick={() => onChange(selecionados.includes(o.valor) ? selecionados.filter(v => v !== o.valor) : [...selecionados, o.valor])}><span className={cn("flex h-4 w-4 items-center justify-center rounded border", selecionados.includes(o.valor) && "border-primary bg-primary text-primary-foreground")}>{selecionados.includes(o.valor) && <Check className="h-3 w-3" />}</span><span className="flex-1 truncate text-left">{o.rotulo}</span><span className="tabular-nums text-muted-foreground">{o.contagem}</span></Button>)}</div>{selecionados.length > 0 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>Limpar seleção</Button>}</PopoverContent></Popover>;
}

/** Um problema a resolver na expansão: regra + detalhe + o que fazer. */
function BlocoProblema({ l }: { l: FilaLinha }) {
  const parte = (campo: string | null, valor: string | null) => {
    if (!temValor(valor)) return null;
    return <>{temValor(campo) ? `${campo}: ` : ""}{valor}</>;
  };
  let detalhe: React.ReactNode = null;
  if (l.campo_matriz === "campos_faltando") {
    detalhe = <>Faltando: {temValor(l.valor_matriz) ? l.valor_matriz : "—"}</>;
  } else {
    const m = parte(l.campo_matriz, l.valor_matriz);
    const d = parte(l.campo_destino, l.valor_destino);
    if (m || d) detalhe = <>{m}{m && d ? " → " : ""}{d}</>;
  }
  const resolver = temValor(l.rota_resolver)
    ? <> <Link to={String(l.rota_resolver)} className="hover:underline">abrir tela →</Link></>
    : l.onde_resolver ? <> Resolve-se no {l.onde_resolver}.</> : null;
  return <div className="space-y-1">
    <p className="text-sm font-medium">{l.regra_nome ?? l.regra}</p>
    {detalhe && <p className="text-xs text-foreground">{detalhe}</p>}
    {(l.o_que_fazer || resolver) && <p className="text-xs text-muted-foreground">{l.o_que_fazer}{resolver}</p>}
  </div>;
}

export default function ConciliacaoFila() {
  const [sp, setSp] = useSearchParams();
  const [pagina, setPagina] = useState(1);
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido, setExpandido] = useState<string | null>(null);
  // Seleção por PRODUTO (chave = sku). Mudar filtro não limpa: quem limpa é o usuário.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<{ coluna: string; dir: "asc" | "desc" }>({ coluna: "regra", dir: "asc" });

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
  // SEM-PRODUTO-NA-URL: o card "Anúncios sem produto" da Mesa linka já filtrado.
  const semProduto = sp.get("sem_produto") === "1";
  function setSemProduto(v: boolean) {
    const novo = new URLSearchParams(sp);
    if (v) novo.set("sem_produto", "1"); else novo.delete("sem_produto");
    setSp(novo, { replace: true });
  }
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

  // POSTGREST-CORTA-EM-MIL (22/09/2026): a view tem 3.348 linhas e o corte
  // silencioso mostrava 877 divergências no lugar de 2.860. Lê em páginas de
  // 1.000 com ordem única e estável (linha_id) até a página vir incompleta.
  // (sku, regra) não é único — a mesma regra emite duas linhas do mesmo produto
  // e o corte na borda da página podia duplicar/omitir linha.
  const fila = useQuery({
    queryKey: ["conciliacao-fila"],
    queryFn: async () => {
      const PAGINA = 1000;
      const todas: FilaLinha[] = [];
      for (let de = 0; ; de += PAGINA) {
        const { data, error } = await supabase
          .from("vw_conciliacao_fila" as never)
          .select("*")
          .order("linha_id")
          .range(de, de + PAGINA - 1);
        if (error) throw error;
        const pagina = (data ?? []) as FilaLinha[];
        todas.push(...pagina);
        if (pagina.length < PAGINA) break;
      }
      return todas;
    },
  });
  // IDENTIDADE-POR-SISTEMA (23/09/2026): cor e ordem dos cards "onde resolver"
  // vêm de `divergencia_sistema_dim` (slug = valor de onde_resolver).
  const sistemasDim = useQuery({
    queryKey: ["divergencia-sistema-dim"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("divergencia_sistema_dim" as never)
        .select("slug, nome, ordem, cor")
        .eq("ativo", true);
      if (error) throw error;
      return (data ?? []) as { slug: string; nome: string; ordem: number | null; cor: string | null }[];
    },
  });

  const carregando = fila.isLoading || sistemasDim.isLoading;
  const erro = fila.error;
  const atualizando = fila.isFetching;

  const linhas = useMemo(() => fila.data ?? [], [fila.data]);

  const aplica = (l: FilaLinha, ignorar?: Grupo) => {
    const q = busca.trim().toLocaleLowerCase("pt-BR");
    if (q && ![l.cod_cadastro, l.sku, l.nome_comercial].filter(temValor).some(v => String(v).toLocaleLowerCase("pt-BR").includes(q))) return false;
    // cod_cadastro nulo é anúncio do Shopify sem produto nosso — só entra no
    // recorte com sem_produto=1. Vale para tudo, inclusive os cards.
    if (semProduto && l.cod_cadastro !== null) return false;
    for (const g of PARAMS) {
      if (g === ignorar) continue;
      const sel = lista(g);
      if (!sel.length) continue;
      const v = g === "camada" ? l.camada : g === "onde" ? l.onde_resolver : g === "regra" ? l.regra : g === "fase" ? l.fase : l.colecao;
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

  // INDICADOR-POR-ONDE-RESOLVE: um card por sistema ATIVO da dimensão, na ordem
  // dela, SEMPRE — mesmo com contagem 0. Sistema que aparece na fila e não está
  // na dimensão (e "Sem destino") vai no fim, neutro. Tooltip quebra por regra.
  const corPorSistema = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of sistemasDim.data ?? []) if (d.cor) m.set(d.slug, d.cor);
    return m;
  }, [sistemasDim.data]);

  const cards = useMemo(() => {
    const base = linhas.filter(l => aplica(l, "onde"));
    const medir = (onde: string) => {
      const ls = base.filter(l => (l.onde_resolver ?? "__sem__") === onde);
      const porRegra = new Map<string, { nome: string; n: number }>();
      for (const l of ls) {
        const atual = porRegra.get(l.regra);
        porRegra.set(l.regra, { nome: l.regra_nome ?? l.regra, n: (atual?.n ?? 0) + 1 });
      }
      const quebra = [...porRegra.values()].sort((a, b) => b.n - a.n).map(x => `${x.n} ${x.nome.toLocaleLowerCase("pt-BR")}`).join(" · ");
      return { n: ls.length, quebra };
    };
    const dim = (sistemasDim.data ?? []).slice().sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));
    const dimSlugs = new Set(dim.map(d => d.slug));
    const principais = dim.map(d => ({ onde: d.slug, label: d.nome, cor: d.cor ?? null, ...medir(d.slug) }));
    const vistos = new Set(linhas.map(l => l.onde_resolver ?? "__sem__"));
    const fallback = [...vistos].filter(k => !dimSlugs.has(k))
      .map(k => ({ onde: k, label: k === "__sem__" ? "Sem destino" : k, cor: null, ...medir(k) }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "pt-BR"));
    return [...principais, ...fallback];
  // aplica depende dos parâmetros da URL
  }, [linhas, sp, sistemasDim.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const facet = (g: Grupo, ops: { valor: string; rotulo: string }[], chave: (l: FilaLinha) => string) =>
    ops.map(o => ({ ...o, contagem: linhas.filter(l => aplica(l, g) && chave(l) === o.valor).length }));

  const opcoesCamada = useMemo(() => {
    const m = new Map<string, { nome: string; ordem: number | null }>();
    for (const l of linhas) {
      const k = l.camada ?? "__sem__";
      if (!m.has(k)) m.set(k, { nome: l.camada_nome ?? k, ordem: l.camada_ordem });
    }
    return [...m.entries()].sort((a, b) => (a[1].ordem ?? 9999) - (b[1].ordem ?? 9999) || a[1].nome.localeCompare(b[1].nome, "pt-BR")).map(([valor, v]) => ({ valor, rotulo: valor === "__sem__" ? "Sem camada" : v.nome }));
  }, [linhas]);
  const opcoesOnde = useMemo(() => [...new Set(linhas.map(l => l.onde_resolver ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem destino" : v })), [linhas]);
  const opcoesRegra = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (!m.has(l.regra)) m.set(l.regra, l.regra_nome ?? l.regra);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [linhas]);
  const opcoesFase = useMemo(() => [...new Set(linhas.map(l => l.fase ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem fase" : v })), [linhas]);
  const opcoesColecao = useMemo(() => [...new Set(linhas.map(l => l.colecao ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem coleção" : v })), [linhas]);

  const filtrosAtivos = (busca ? 1 : 0) + (semProduto ? 1 : 0) + PARAMS.reduce((n, g) => n + lista(g).length, 0);
  const paginas = Math.max(1, Math.ceil(recorte.length / tamanho));
  const paginaAtual = Math.min(pagina, paginas);
  const paginaLinhas = recorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  const produtos = new Set(recorte.map(l => l.sku)).size;
  // CICLO-PLANILHA: produtos do recorte com a regra de cadastro incompleto.
  const codsIncompletos = useMemo(
    () => [...new Set(recorte.filter(l => l.regra === REGRA_INCOMPLETO && temValor(l.cod_cadastro)).map(l => String(l.cod_cadastro)))],
    [recorte],
  );
  // MUTIRÃO: a ação em lote age sobre a SELEÇÃO do usuário, não sobre o recorte invisível.
  // Deriva de `linhas` para cobrir produto selecionado que saiu do recorte atual.
  const produtoPorSku = useMemo(() => {
    const m = new Map<string, { sku: string; cod_cadastro: string | null; fase: string | null }>();
    for (const l of linhas) if (temValor(l.sku)) m.set(String(l.sku), { sku: String(l.sku), cod_cadastro: l.cod_cadastro ?? null, fase: l.fase ?? null });
    return m;
  }, [linhas]);
  const skusRecorte = useMemo(() => new Set(recorte.filter(l => temValor(l.sku)).map(l => String(l.sku))), [recorte]);
  const recorteMarcados = skusRecorte.size === 0 ? 0 : [...skusRecorte].filter(s => selecionados.has(s)).length;
  const selecionadosAtivos = useMemo<ProdutoLote[]>(
    () => [...selecionados].map(s => produtoPorSku.get(s)).filter((p): p is { sku: string; cod_cadastro: string | null; fase: string | null } => !!p && p.fase === "ativo")
      .map(p => ({ sku: p.sku, cod_cadastro: p.cod_cadastro })),
    [selecionados, produtoPorSku],
  );
  // Correção não olha fase: vale para qualquer produto selecionado — mas cada
  // botão só recebe selecionados com pendência do sistema dele (derive de
  // `linhas`, não do recorte filtrado, para não depender do filtro atual).
  const selecionadosProdutos = useMemo<ProdutoXpm[]>(
    () => [...selecionados].map(s => produtoPorSku.get(s)).filter((p): p is { sku: string; cod_cadastro: string | null; fase: string | null } => !!p)
      .map(p => ({ sku: p.sku, cod_cadastro: p.cod_cadastro })),
    [selecionados, produtoPorSku],
  );
  const sistemasPorSku = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of linhas) {
      if (!temValor(l.sku) || !temValor(l.onde_resolver)) continue;
      let set = m.get(String(l.sku));
      if (!set) { set = new Set(); m.set(String(l.sku), set); }
      set.add(l.onde_resolver);
    }
    return m;
  }, [linhas]);
  const filtrarPorSistema = (sistema: string) => selecionadosProdutos.filter(p => sistemasPorSku.get(p.sku)?.has(sistema));
  const selecionadosProdutosXpm = useMemo(() => filtrarPorSistema("XPM"), [selecionadosProdutos, sistemasPorSku]);
  const selecionadosProdutosBling = useMemo(() => filtrarPorSistema("Bling"), [selecionadosProdutos, sistemasPorSku]);
  const selecionadosForaDeAtivo = selecionados.size - selecionadosAtivos.length;
  const selecionadosForaDoRecorte = [...selecionados].filter(s => !skusRecorte.has(s)).length;
  const alternarProduto = (sku: string) => setSelecionados(prev => {
    const novo = new Set(prev);
    if (novo.has(sku)) novo.delete(sku); else novo.add(sku);
    return novo;
  });
  const alternarRecorte = (marcar: boolean) => setSelecionados(prev => {
    const novo = new Set(prev);
    for (const s of skusRecorte) { if (marcar) novo.add(s); else novo.delete(s); }
    return novo;
  });
  const estado = carregando ? "Carregando divergências…" : `${recorte.length} divergência(s) · ${produtos} produto(s)`;

  function ordenar(key: string) {
    setOrdem(o => o.coluna === key ? { coluna: key, dir: o.dir === "asc" ? "desc" : "asc" } : { coluna: key, dir: "asc" });
  }

  function exportar() {
    const cab = ["Cód. cadastro", "SKU", "Nome", "Fase", "Coleção", "Regra", "Camada", "Campo matriz", "Valor matriz", "Campo destino", "Valor destino", "Onde resolver", "Consequência", "O que fazer"];
    const corpo = recorte.map(l => [
      l.cod_cadastro, l.sku, l.nome_comercial, l.fase, l.colecao, l.regra_nome ?? l.regra, l.camada_nome ?? l.camada,
      l.campo_matriz, l.valor_matriz,
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
    if (c.key === "regra") return <Tooltip><TooltipTrigger asChild><Badge variant="outline" className="whitespace-nowrap font-normal">{l.regra_nome ?? l.regra}</Badge></TooltipTrigger><TooltipContent className="max-w-xs">{l.consequencia ?? (l.regra_nome ?? l.regra)}</TooltipContent></Tooltip>;
    if (c.key === "camada_nome") return <span className="whitespace-nowrap">{l.camada_nome ?? l.camada ?? "—"}</span>;
    if (c.key === "matriz" || c.key === "destino") {
      const campo = c.key === "matriz" ? l.campo_matriz : l.campo_destino;
      const valor = c.key === "matriz" ? l.valor_matriz : l.valor_destino;
      if (!temValor(campo) && !temValor(valor)) return celulaVazia;
      return <span className="block max-w-48"><span className="block truncate">{temValor(valor) ? String(valor) : "—"}</span>{temValor(campo) && <span className="block truncate text-[10px] text-muted-foreground">{campo}</span>}</span>;
    }
    if (c.key === "onde") {
      const cor = corPorSistema.get(l.onde_resolver ?? "");
      return <span className="whitespace-nowrap"><span style={cor ? { color: cor } : undefined}>{l.onde_resolver ?? "—"}</span>{temValor(l.rota_resolver) && <> <Link to={String(l.rota_resolver)} className="hover:underline">abrir tela →</Link></>}</span>;
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
        {codsIncompletos.length > 0 && <PlanilhaPendencias cods={codsIncompletos} onGravado={() => { void fila.refetch(); }} />}
        <VoltarFaseLote produtos={selecionadosAtivos} onFeito={() => { setSelecionados(new Set()); void fila.refetch(); }} />
        <CorrigirXpmLote produtos={selecionadosProdutosXpm} onFeito={() => { void fila.refetch(); }} />
        <CorrigirBlingLote produtos={selecionadosProdutosBling} onFeito={() => { void fila.refetch(); }} />
        {selecionadosAtivos.length > 0 && selecionadosForaDeAtivo > 0 && <span className="text-xs text-muted-foreground">{selecionadosForaDeAtivo} selecionado(s) fora de Ativo não entram</span>}
        <Button size="sm" disabled={atualizando} onClick={async () => { await fila.refetch(); }}><RefreshCw className={cn("mr-2 h-4 w-4", atualizando && "animate-spin")} />Atualizar</Button>
      </>}
    />

    {erro && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar a fila de conciliação. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}

    <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicadores por onde resolver">
      {carregando ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />) : cards.map(c => {
        const selecionado = lista("onde").includes(c.onde);
        const cor = c.cor ?? undefined;
        const zera = c.n === 0;
        const botao = <Button
          variant="outline"
          disabled={zera}
          className={cn("h-20 items-start justify-center border border-l-4 p-3 text-left", zera && "opacity-50", selecionado && !cor && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
          style={{
            ...(selecionado && cor ? { borderColor: cor, background: `${cor}1A` } : {}),
            ...(cor ? { borderLeftColor: cor } : {}),
          }}
          onClick={() => setLista("onde", selecionado ? [] : [c.onde])}
        >
          <span className="flex w-full flex-col">
            <span className="truncate text-[11px] font-normal" style={cor ? { color: cor } : undefined}>{c.label}</span>
            <span className="mt-1 text-[21px] font-medium tabular-nums text-foreground">{c.n}</span>
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
      <FiltroFacetado label="Camada" selecionados={lista("camada")} onChange={v => setLista("camada", v)} opcoes={facet("camada", opcoesCamada, l => l.camada ?? "__sem__")} />
      <FiltroFacetado label="Onde resolver" selecionados={lista("onde")} onChange={v => setLista("onde", v)} opcoes={facet("onde", opcoesOnde, l => l.onde_resolver ?? "__sem__")} />
      <FiltroFacetado label="Regra" selecionados={lista("regra")} onChange={v => setLista("regra", v)} opcoes={facet("regra", opcoesRegra, l => l.regra)} />
      <FiltroFacetado label="Fase" selecionados={lista("fase")} onChange={v => setLista("fase", v)} opcoes={facet("fase", opcoesFase, l => l.fase ?? "__sem__")} />
      <FiltroFacetado label="Coleção" selecionados={lista("colecao")} onChange={v => setLista("colecao", v)} opcoes={facet("colecao", opcoesColecao, l => l.colecao ?? "__sem__")} />
      {semProduto && <Button variant="ghost" size="sm" onClick={() => setSemProduto(false)}>Só anúncios sem produto<X className="ml-1 h-3 w-3" /></Button>}
      {filtrosAtivos > 0 && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros ({filtrosAtivos})</Button>}
    </section>

    {carregando ? <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
    : recorte.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-muted-foreground">Nenhuma divergência neste recorte.</p><Button variant="link" onClick={limpar}>Limpar filtros</Button></div>
    : <div className="overflow-hidden rounded-md border bg-card">
      {selecionados.size > 0 && <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
        <span className="font-medium">{selecionados.size} produto(s) selecionado(s)</span>
        {selecionadosForaDoRecorte > 0 && <span className="text-muted-foreground">({selecionadosForaDoRecorte} fora do recorte atual)</span>}
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
      </div>}
      <Table className="text-xs" containerClassName="max-h-[min(62vh,46rem)]">
        <TableHeader><TableRow>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted">
            <Checkbox
              aria-label="Selecionar todos os produtos do recorte"
              checked={recorteMarcados === skusRecorte.size ? true : recorteMarcados > 0 ? "indeterminate" : false}
              onCheckedChange={v => alternarRecorte(v === true)}
            />
          </TableHead>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted" />
          {COLUNAS.map(c => <TableHead key={String(c.key)} className="sticky top-0 z-40 whitespace-nowrap bg-muted font-medium" aria-sort={ordem.coluna === c.key ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
            {c.ordenavel ? <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => ordenar(String(c.key))}>{c.rotulo}{ordem.coluna !== c.key ? <ArrowUpDown className="ml-1 h-3 w-3" /> : ordem.dir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />}</Button> : c.rotulo}
          </TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{paginaLinhas.map(l => <Fragment key={l.linha_id}>
          <TableRow className="border-b">
            <TableCell className="py-2.5 align-top">
              <Checkbox
                aria-label={`Selecionar ${l.cod_cadastro ?? l.sku}`}
                checked={temValor(l.sku) && selecionados.has(String(l.sku))}
                disabled={!temValor(l.sku)}
                onCheckedChange={() => { if (temValor(l.sku)) alternarProduto(String(l.sku)); }}
              />
            </TableCell>
            <TableCell className="py-2.5 align-top">
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido === l.sku ? `Recolher ${l.sku}` : `Expandir ${l.sku}`} onClick={() => setExpandido(e => e === l.sku ? null : l.sku)}>
                {expandido === l.sku ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </TableCell>
            {COLUNAS.map(c => <TableCell key={String(c.key)} className="py-2.5 align-top">{celula(l, c)}</TableCell>)}
          </TableRow>
          {expandido === l.sku && <TableRow><TableCell colSpan={COLUNAS.length + 2} className="bg-muted/30 p-4">
            <div className="space-y-3">{linhas.filter(x => x.sku === l.sku).map(x => <BlocoProblema key={x.linha_id} l={x} />)}</div>
          </TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table>
      <RodapePaginacao total={recorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="conciliacao_cadastro" onPagina={setPagina} onTamanhoPagina={setTamanho} />
    </div>}
  </PageShell></TooltipProvider>;
}
