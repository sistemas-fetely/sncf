import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useEstadoTela, useFocoAoVoltar, useRestaurarScroll, montarFrom, resolverAcao } from "@/lib/navegacao";
import type { SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronDown, ChevronRight,
  Download, FileSpreadsheet, GitCompare, Plus, RefreshCw, Search, Upload, X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProdutoAbas } from "@/components/produto/ProdutoAbas";
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
import { fmtData, fmtDataHora } from "@/lib/data";
import { temValor } from "@/components/acervo/DeParaConciliacao";
// 20/10/2026: aposentado — porta única é a planilha de cadastro
import { PlanilhaPendencias } from "@/components/acervo/PlanilhaPendencias";
import { VoltarFaseLote, type ProdutoLote } from "@/components/acervo/VoltarFaseLote";
import { CorrigirXpmLote, type ProdutoXpm } from "@/components/acervo/CorrigirXpmLote";
import { CorrigirBlingLote } from "@/components/acervo/CorrigirBlingLote";
// 20/10/2026 (Flavio): Mesa = área de trabalho (só tabela); todo processo de consistência/correção vive na Conciliação de Cadastro
import { VarreduraSistemaCard } from "@/components/acervo/ConsistenciaBlingCard";
import { BlingSyncControle } from "@/components/acervo/CadastroBlingSync";
import { agruparPorProduto, ordenarProdutos, regrasDoProduto, resumoCampos, contarPorCanal, type ProdutoFila } from "@/lib/acervo/conciliacaoProdutos";
import { CorrigirShopifyLote } from "@/components/acervo/CorrigirShopifyLote";
// 20/10/2026 (Flavio): porta única de ajuste de cadastro = Conciliação; Mesa = só tabela
import { BotaoGuardado } from "@/components/acesso/BotaoGuardado";
import { NascerProdutoNacionalDialog } from "@/components/acervo/NascerProdutoNacionalDialog";
import { ExportarPlanilhaCadastroDialog } from "@/components/acervo/ExportarPlanilhaCadastroDialog";
import { ImportarPlanilhaCadastroDialog } from "@/components/acervo/ImportarPlanilhaCadastroDialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCatalogoLeitura } from "@/hooks/useCatalogoLeitura";
import { resolverAbaConciliacao } from "@/lib/acervo/abasConciliacao";
import { AtualizacaoCatalogoDia } from "@/components/acervo/AtualizacaoCatalogoDia";

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

type ColDef = { key: "cod_cadastro" | "sku" | "nome_comercial" | "fase" | "divergencias" | "campos"; rotulo: string; ordenavel?: boolean; largura: string };
const COLUNAS: ColDef[] = [
  { key: "cod_cadastro", rotulo: "Cód. cadastro", ordenavel: true, largura: "w-28" },
  { key: "sku", rotulo: "SKU", ordenavel: true, largura: "w-32" },
  { key: "nome_comercial", rotulo: "Nome", ordenavel: true, largura: "w-[20%]" },
  { key: "fase", rotulo: "Fase", ordenavel: true, largura: "w-20" },
  { key: "divergencias", rotulo: "Divergências", ordenavel: true, largura: "w-[22%]" },
  { key: "campos", rotulo: "Campos", largura: "" },
];

/** Bling — campo a campo (vw_bling_cadastro_depara), carregado só ao expandir. */
function DeParaBling({ sku }: { sku: string }) {
  const q = useQuery({
    queryKey: ["bling-cadastro-depara", sku],
    queryFn: async () => {
      const { data, error } = await supabase.from("vw_bling_cadastro_depara" as never).select("campo, rotulo, valor_bling, valor_sncf, lido_em, regra, ordem")
        .eq("sku", sku).order("regra").order("ordem");
      if (error) throw error;
      return (data ?? []) as { campo: string; rotulo: string | null; valor_bling: string | null; valor_sncf: string | null; lido_em: string | null }[];
    },
  });
  if (q.isLoading) return <Skeleton className="h-16 w-full" />;
  if (q.error) return <Alert variant="destructive"><AlertDescription>Não foi possível ler o de-para do Bling: {(q.error as Error).message}</AlertDescription></Alert>;
  const ls = q.data ?? [];
  if (!ls.length) return <p className="text-xs text-muted-foreground">Nenhum campo divergente no último card lido.</p>;
  const lido = ls.map(l => l.lido_em).filter(Boolean).sort().at(-1);
  return <div className="space-y-1">
    <div className="overflow-hidden rounded-md border bg-card"><Table className="text-xs"><TableHeader><TableRow><TableHead>Campo</TableHead><TableHead>Bling atual</TableHead><TableHead>SNCF</TableHead></TableRow></TableHeader>
      <TableBody>{ls.map((l, i) => <TableRow key={`${l.campo}-${i}`}><TableCell>{l.rotulo ?? l.campo}</TableCell><TableCell className="break-all">{l.valor_bling ?? <span className="text-muted-foreground">vazio</span>}</TableCell><TableCell className="break-all">{l.valor_sncf ?? "—"}</TableCell></TableRow>)}</TableBody></Table></div>
    {lido && <p className="text-[11px] text-muted-foreground">Lido do Bling em {fmtDataHora(lido)}</p>}
  </div>;
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
  const [nascerAberto, setNascerAberto] = useState(false);
  const [menuPlanilha, setMenuPlanilha] = useState(false);
  const [exportCad, setExportCad] = useState(false);
  const [importCad, setImportCad] = useState(false);
  const [sp, setSp] = useSearchParams();
  const location = useLocation();
  const catalogo = useCatalogoLeitura();
  // TELA-LEMBRA-ONDE-EU-ESTAVA: página e ordem também na URL (filtros já moravam lá).
  const [nav, setNav] = useEstadoTela({ pagina: 1, ordem: "cod_cadastro:asc" });
  const pagina = nav.pagina;
  const setPagina = (v: number) => setNav({ pagina: v });
  const [tamanho, setTamanho] = useState<number>(DEFAULT_PAGE_SIZE);
  const [expandido, setExpandido] = useState<string | null>(null);
  // Seleção por PRODUTO (chave = sku). Mudar filtro não limpa: quem limpa é o usuário.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const ordem = useMemo(() => {
    const [coluna, dir] = nav.ordem.split(":");
    return { coluna: coluna || "cod_cadastro", dir: (dir === "desc" ? "desc" : "asc") as "asc" | "desc" };
  }, [nav.ordem]);
  const setOrdem = (v: SetStateAction<{ coluna: string; dir: "asc" | "desc" }>) => {
    const o = resolverAcao(v, ordem);
    setNav({ ordem: `${o.coluna}:${o.dir}` });
  };

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
  function limpar() {
    const novo = new URLSearchParams(sp);
    for (const k of [...PARAMS, "q", "sem_produto", "pagina"]) novo.delete(k);
    setSp(novo, { replace: true });
  }

  // POSTGREST-CORTA-EM-MIL (22/09/2026): a view tem 3.348 linhas e o corte
  // silencioso mostrava 877 divergências no lugar de 2.860. Lê em páginas de
  // 1.000 com ordem única e estável (linha_id) até a página vir incompleta.
  // (sku, regra) não é único — a mesma regra emite duas linhas do mesmo produto
  // e o corte na borda da página podia duplicar/omitir linha.
  // Uma chamada: fn_conciliacao_fila() devolve TODAS as linhas de vw_conciliacao_fila (sem corte de 1.000).
  const fila = useQuery({
    queryKey: ["conciliacao-fila"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_conciliacao_fila" as never);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("fn_conciliacao_fila não devolveu uma lista.");
      return data as unknown as FilaLinha[];
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
  const aba = resolverAbaConciliacao(sp.get('aba'), location.hash, catalogo.pendencias, linhas.length);
  const setAba = (valor: string) => {
    if (valor !== 'entrada' && valor !== 'saida') return;
    const novo = new URLSearchParams(sp);
    novo.set('aba', valor);
    setSp(novo);
  };
  useEffect(() => {
    if (sp.get('aba') === 'entrada' || sp.get('aba') === 'saida') return;
    if (location.hash !== '#atualizacao-do-dia' && (!catalogo.pronto || !fila.isSuccess)) return;
    const novo = new URLSearchParams(sp);
    novo.set('aba', aba);
    setSp(novo, { replace: true });
  }, [aba, sp, location.hash, catalogo.pronto, fila.isSuccess, setSp]);

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

  const recorte = useMemo(() => linhas.filter(l => aplica(l)),
  // aplica depende dos parâmetros da URL, que entram na dependência via `sp`
  [linhas, sp]); // eslint-disable-line react-hooks/exhaustive-deps
  const produtosRecorte = useMemo(() => ordenarProdutos(agruparPorProduto(recorte), ordem.coluna, ordem.dir), [recorte, ordem]);

  const chaveFiltros = [...PARAMS, "q", "sem_produto"].map((k) => sp.get(k) ?? "").join("|");
  const primeiraRender = useRef(true);
  useEffect(() => {
    if (primeiraRender.current) { primeiraRender.current = false; return; }
    setPagina(1); setExpandido(null);
  }, [chaveFiltros, tamanho]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const contagem = contarPorCanal(base);
    const medir = (onde: string) => {
      const ls = base.filter(l => (l.onde_resolver ?? "__sem__") === onde);
      const porRegra = new Map<string, { nome: string; n: number }>();
      for (const l of ls) {
        const atual = porRegra.get(l.regra);
        porRegra.set(l.regra, { nome: l.regra_nome ?? l.regra, n: (atual?.n ?? 0) + 1 });
      }
      const quebra = [...porRegra.values()].sort((a, b) => b.n - a.n).map(x => `${x.n} ${x.nome.toLocaleLowerCase("pt-BR")}`).join(" · ");
      const c = contagem.get(onde);
      return { n: c?.produtos ?? 0, divergencias: c?.divergencias ?? 0, quebra };
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
    return [...m.entries()].sort((a, b) => a[1].nome.localeCompare(b[1].nome, "pt-BR")).map(([valor, v]) => ({ valor, rotulo: valor === "__sem__" ? "Sem camada" : v.nome }));
  }, [linhas]);
  const opcoesRegra = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhas) if (!m.has(l.regra)) m.set(l.regra, l.regra_nome ?? l.regra);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map(([valor, rotulo]) => ({ valor, rotulo }));
  }, [linhas]);
  const opcoesFase = useMemo(() => [...new Set(linhas.map(l => l.fase ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem fase" : v })), [linhas]);
  const opcoesColecao = useMemo(() => [...new Set(linhas.map(l => l.colecao ?? "__sem__"))].sort((a, b) => a.localeCompare(b, "pt-BR")).map(v => ({ valor: v, rotulo: v === "__sem__" ? "Sem coleção" : v })), [linhas]);

  const filtrosAtivos = (busca ? 1 : 0) + (semProduto ? 1 : 0) + PARAMS.reduce((n, g) => n + lista(g).length, 0);
  const paginas = Math.max(1, Math.ceil(produtosRecorte.length / tamanho));
  const paginaAtual = Math.min(pagina, paginas);
  const paginaProdutos = produtosRecorte.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho);
  useFocoAoVoltar({ pronto: !carregando, idsVisiveis: paginaProdutos.map((l) => l.cod_cadastro ?? l.sku).filter(Boolean).map(String) });
  useRestaurarScroll(null, !carregando);
  const produtos = produtosRecorte.length;
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
  const selecionadosProdutosShopify = useMemo(() => filtrarPorSistema("Shopify"), [selecionadosProdutos, sistemasPorSku]);
  // CARD-DECIDIDO-ANTES: se alguma linha selecionada vem das regras de card do
  // Bling, a janela "Corrigir no Bling" já abre com a opção do card marcada.
  const sugerirCardBling = useMemo(
    () => linhas.some(l => temValor(l.sku) && selecionados.has(String(l.sku)) && (l.regra === "bling_card_ativo_antes_da_hora" || l.regra === "bling_card_inativo")),
    [linhas, selecionados],
  );
  const selecionadosForaDeAtivo = selecionados.size - selecionadosAtivos.length;
  const selecionadosForaDoRecorte = [...selecionados].filter(s => !skusRecorte.has(s)).length;
  // Varredura · Corrigir (XPM/Shopify): seleciona todos os produtos da regra e abre o MESMO diálogo da barra.
  const [sinalXpm, setSinalXpm] = useState(0);
  const [sinalShopify, setSinalShopify] = useState(0);
  const corrigirPorRegra = (regra: string, abrir: () => void) => {
    setSelecionados(new Set(linhas.filter(l => l.regra === regra && temValor(l.sku)).map(l => String(l.sku))));
    abrir();
  };
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
  // Canal selecionado nos cards (filtro `onde` com um único valor).
  const canalSel = lista("onde").length === 1 ? lista("onde")[0] : null;
  // Com card: só a ação daquele canal (VoltarFase em SNCF ou sem card). Sem card: ações com ao menos 1 produto pendente.
  const mostrarAcao = (canal: string, n: number) => canalSel ? canalSel === canal : n > 0;
  const estado = <>
    {carregando ? "Carregando divergências…" : `${produtos} produto(s) · ${recorte.length} divergência(s)`}
    {" · "}
    <Link to="/vendas/produto/estoque/nomes-bling" className="underline-offset-2 hover:underline hover:text-foreground">Histórico de nomes no Bling</Link>
  </>;

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

  function celula(p: ProdutoFila<FilaLinha>, c: ColDef) {
    if (c.key === "cod_cadastro") return p.cod_cadastro
      ? <Link to={`/vendas/produto/ficha/${encodeURIComponent(p.cod_cadastro)}`} state={{ from: montarFrom(location.pathname, location.search, p.cod_cadastro), fromLabel: "Conciliação de Cadastro" }} className="font-medium hover:underline">{p.cod_cadastro}</Link>
      : celulaVazia;
    if (c.key === "sku") return <span className="block truncate" title={p.sku}>{p.sku}</span>;
    if (c.key === "nome_comercial") return temValor(p.nome_comercial)
      ? <Tooltip><TooltipTrigger asChild><span className="block truncate">{p.nome_comercial}</span></TooltipTrigger><TooltipContent className="max-w-sm">{p.nome_comercial}</TooltipContent></Tooltip>
      : celulaVazia;
    if (c.key === "fase") return <Badge variant="outline" className="font-normal">{p.fase ?? "—"}</Badge>;
    const doRecorte = p.linhas;
    if (c.key === "divergencias") return <span className="flex flex-wrap gap-1">{regrasDoProduto(p).map(l => {
      const cor = corPorSistema.get(l.onde_resolver ?? "");
      return <Tooltip key={l.regra}><TooltipTrigger asChild><Badge variant="outline" className="gap-1 font-normal" style={cor ? { borderColor: cor } : undefined}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" style={cor ? { background: cor } : undefined} />{l.regra_nome ?? l.regra}</Badge></TooltipTrigger>
        <TooltipContent className="max-w-xs">{l.consequencia ?? (l.regra_nome ?? l.regra)}</TooltipContent></Tooltip>;
    })}</span>;
    const txt = resumoCampos(doRecorte);
    if (!txt) return celulaVazia;
    return <Tooltip><TooltipTrigger asChild><span className="block truncate text-left">{txt}</span></TooltipTrigger><TooltipContent className="max-w-sm">{txt}</TooltipContent></Tooltip>;
  }

  return <TooltipProvider delayDuration={200}><PageShell>
    <NascerProdutoNacionalDialog open={nascerAberto} onOpenChange={setNascerAberto} onNasceu={() => { void fila.refetch(); }} />
    <ExportarPlanilhaCadastroDialog open={exportCad} onOpenChange={setExportCad} />
    <ImportarPlanilhaCadastroDialog open={importCad} onOpenChange={setImportCad} onConcluido={() => { void fila.refetch(); }} />
    <PageHeader
      titulo="Conciliação de Cadastro"
      icone={GitCompare}
      estado={aba === "saida" ? estado : undefined}
      acoes={aba === "entrada" ? <>
        <DropdownMenu open={menuPlanilha} onOpenChange={setMenuPlanilha}>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><FileSpreadsheet className="mr-2 h-4 w-4" />Planilha<ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex w-64 flex-col gap-1 p-1">
            <BotaoGuardado slug="acao.produto_nascer_nacional" rotuloAcao="Nascer produto" variant="ghost" size="sm" className="justify-start" onClick={() => { setMenuPlanilha(false); setNascerAberto(true); }}><Plus className="mr-2 h-4 w-4" />Nascer produto</BotaoGuardado>
            <Button variant="ghost" size="sm" className="justify-start" onClick={() => { setMenuPlanilha(false); setExportCad(true); }}><Download className="mr-2 h-4 w-4" />Exportar planilha de cadastro</Button>
            <BotaoGuardado slug="acao.produto_importar_planilha_cadastro" rotuloAcao="Importar planilha de cadastro" variant="ghost" size="sm" className="justify-start" onClick={() => { setMenuPlanilha(false); setImportCad(true); }}><Upload className="mr-2 h-4 w-4" />Importar planilha de cadastro</BotaoGuardado>
          </DropdownMenuContent>
        </DropdownMenu>
      </> : <>
        <Button variant="outline" size="sm" onClick={exportar} disabled={!recorte.length}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>
        <Button size="sm" disabled={atualizando} onClick={async () => { await fila.refetch(); }}><RefreshCw className={cn("mr-2 h-4 w-4", atualizando && "animate-spin")} />Atualizar</Button>
      </>}
    />

    <ProdutoAbas />

    <Tabs value={aba} onValueChange={setAba} className="space-y-4">
      <TabsList className="h-auto max-w-full flex-wrap justify-start" aria-label="Fluxo da conciliação">
        <TabsTrigger value="entrada" className="gap-2">Entrada · Planilha<Badge variant="secondary">{catalogo.pronto ? catalogo.pendencias : '…'}</Badge></TabsTrigger>
        <TabsTrigger value="saida" className="gap-2">Saída · Destinos<Badge variant="secondary">{fila.isSuccess ? linhas.length : '…'}</Badge></TabsTrigger>
      </TabsList>
      {catalogo.erro && <Alert variant="destructive"><AlertDescription>Não foi possível consultar as pendências da planilha: {catalogo.erro.message}</AlertDescription></Alert>}
      <TabsContent value="entrada" className="space-y-4">
        <p className="text-sm text-muted-foreground">O que o time escreveu na planilha do catálogo e ainda não entrou no sistema.</p>
        <AtualizacaoCatalogoDia />
      </TabsContent>
      <TabsContent value="saida" className="space-y-4">
        <p className="text-sm text-muted-foreground">O que está diferente entre o sistema e os canais (Bling, XPM, Shopify).</p>
    {erro && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>Não foi possível carregar a fila de conciliação. Detalhe: {(erro as Error).message}</AlertDescription></Alert>}

    <section className="grid grid-cols-2 gap-2 md:grid-cols-4" aria-label="Indicadores por onde resolver">
      {carregando ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />) : cards.map(c => {
        const selecionado = lista("onde").includes(c.onde);
        const cor = c.cor ?? undefined;
        const zera = c.n === 0;
        const botao = <Button
          variant="outline"
          disabled={zera}
          className={cn("h-auto min-h-20 items-start justify-center border border-l-4 p-3 text-left", zera && "opacity-50", selecionado && !cor && "ring-2 ring-primary ring-offset-2 ring-offset-background")}
          style={{
            ...(selecionado && cor ? { borderColor: cor, background: `${cor}1A` } : {}),
            ...(cor ? { borderLeftColor: cor } : {}),
          }}
          onClick={() => setLista("onde", selecionado ? [] : [c.onde])}
        >
          <span className="flex w-full flex-col">
            <span className="truncate text-[11px] font-normal" style={cor ? { color: cor } : undefined}>{c.label}</span>
            <span className="mt-1 text-[21px] font-medium tabular-nums text-foreground">{c.n}</span>
            <span className="text-[11px] font-normal text-muted-foreground">{c.divergencias} divergências</span>
          </span>
        </Button>;
        return <Tooltip key={c.onde}><TooltipTrigger asChild>{botao}</TooltipTrigger><TooltipContent className="max-w-xs">{c.quebra || "Nenhuma divergência neste recorte."}</TooltipContent></Tooltip>;
      })}
    </section>
    {/* Faixa do canal selecionado: Bling = motor de cadastro; XPM/Shopify = varredura compacta. SNCF/nenhum = sem faixa. */}
    {canalSel && ["Bling", "XPM", "Shopify"].includes(canalSel) && <section className="rounded-md border bg-card p-3" aria-label={`Controle ${canalSel}`}>
      {canalSel === "Bling" ? <BlingSyncControle /> : <VarreduraSistemaCard sistema={canalSel as "XPM" | "Shopify"} compacto />}
    </section>}

    <section className="flex flex-wrap items-center gap-2 border-y py-3">
      <div className="relative min-w-64 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" placeholder="Buscar código, SKU ou nome" />
      </div>
      <FiltroFacetado label="Camada" selecionados={lista("camada")} onChange={v => setLista("camada", v)} opcoes={facet("camada", opcoesCamada, l => l.camada ?? "__sem__")} />
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
        {selecionadosForaDeAtivo > 0 && <span className="text-muted-foreground">{selecionadosForaDeAtivo} selecionado(s) fora de Ativo não entram</span>}
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {mostrarAcao("SNCF", selecionadosAtivos.length) && <VoltarFaseLote produtos={selecionadosAtivos} onFeito={() => { setSelecionados(new Set()); void fila.refetch(); }} />}
          {mostrarAcao("XPM", selecionadosProdutosXpm.length) && <CorrigirXpmLote produtos={selecionadosProdutosXpm} onFeito={() => { void fila.refetch(); }} abrirSinal={sinalXpm} />}
          {mostrarAcao("Bling", selecionadosProdutosBling.length) && <CorrigirBlingLote produtos={selecionadosProdutosBling} onFeito={() => { void fila.refetch(); }} sugerirCard={sugerirCardBling} />}
          {mostrarAcao("Shopify", selecionadosProdutosShopify.length) && <CorrigirShopifyLote produtos={selecionadosProdutosShopify} onFeito={() => { void fila.refetch(); }} abrirSinal={sinalShopify} />}
        </span>
      </div>}
      <Table className="table-fixed text-xs" containerClassName="max-h-[min(62vh,46rem)]">
        <TableHeader><TableRow>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted">
            <Checkbox
              aria-label="Selecionar todos os produtos do recorte"
              checked={recorteMarcados === skusRecorte.size ? true : recorteMarcados > 0 ? "indeterminate" : false}
              onCheckedChange={v => alternarRecorte(v === true)}
            />
          </TableHead>
          <TableHead className="sticky top-0 z-40 w-8 bg-muted" />
          {COLUNAS.map(c => <TableHead key={c.key} className={cn("sticky top-0 z-40 whitespace-nowrap bg-muted font-medium", c.largura)} aria-sort={ordem.coluna === c.key ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}>
            {c.ordenavel ? <Button variant="ghost" size="sm" className="h-auto p-0 font-medium" onClick={() => ordenar(c.key)}>{c.rotulo}{ordem.coluna !== c.key ? <ArrowUpDown className="ml-1 h-3 w-3" /> : ordem.dir === "asc" ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />}</Button> : c.rotulo}
          </TableHead>)}
        </TableRow></TableHeader>
        <TableBody>{paginaProdutos.map(p => <Fragment key={p.sku}>
          <TableRow className="border-b" data-foco-id={String(p.cod_cadastro ?? p.sku)}>
            <TableCell className="py-2.5 align-top">
              <Checkbox aria-label={`Selecionar ${p.cod_cadastro ?? p.sku}`} checked={selecionados.has(p.sku)} onCheckedChange={() => alternarProduto(p.sku)} />
            </TableCell>
            <TableCell className="py-2.5 align-top">
              <Button variant="ghost" size="icon" className="h-6 w-6" aria-label={expandido === p.sku ? `Recolher ${p.sku}` : `Expandir ${p.sku}`} onClick={() => setExpandido(e => e === p.sku ? null : p.sku)}>
                {expandido === p.sku ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </Button>
            </TableCell>
            {COLUNAS.map(c => <TableCell key={c.key} className="py-2.5 align-top">{celula(p, c)}</TableCell>)}
          </TableRow>
          {expandido === p.sku && <TableRow><TableCell colSpan={COLUNAS.length + 2} className="bg-muted/30 p-4">
            <div className="space-y-4">
              <div className="space-y-3"><p className="text-xs font-medium text-muted-foreground">O que fazer</p>{linhas.filter(x => x.sku === p.sku).map(x => <BlocoProblema key={x.linha_id} l={x} />)}</div>
              {linhas.some(x => x.sku === p.sku && x.onde_resolver === "Bling") && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Bling — campo a campo</p><DeParaBling sku={p.sku} /></div>}
            </div>
          </TableCell></TableRow>}
        </Fragment>)}</TableBody>
      </Table>
      <RodapePaginacao total={produtosRecorte.length} pagina={paginaAtual} tamanhoPagina={tamanho} tela="conciliacao_cadastro" onPagina={setPagina} onTamanhoPagina={setTamanho} />
    </div>}
      </TabsContent>
    </Tabs>
  </PageShell></TooltipProvider>;
}
