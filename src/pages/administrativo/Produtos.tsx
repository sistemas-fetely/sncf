import { PageShell } from "@/components/layout/PageShell";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy } from "lucide-react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelectTrigger } from "@/components/ui/filter-select-trigger";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectValue,
} from "@/components/ui/select";

type TomFaixa = "alerta" | "atencao" | "neutro" | "bom";
interface MetricaFaixa {
  metrica_slug: string;
  rotulo: string;
  minimo: number | null;
  maximo: number | null;
  tom: TomFaixa | null;
  ordem: number | null;
}
function dentroFaixa(f: MetricaFaixa, v: number | null | undefined): boolean {
  if (v == null) return false;
  const n = Number(v);
  if (f.minimo != null && n < Number(f.minimo)) return false;
  if (f.maximo != null && n >= Number(f.maximo)) return false;
  return true;
}
function faixaDe(faixas: MetricaFaixa[], v: number | null | undefined): MetricaFaixa | undefined {
  return faixas.find((f) => dentroFaixa(f, v));
}
function classeTom(tom: TomFaixa | null | undefined): string | undefined {
  if (tom === "alerta") return "text-destructive font-medium";
  if (tom === "atencao") return "text-warning font-medium";
  if (tom === "bom") return "text-success";
  return undefined;
}
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  RefreshCw, Search, ImageOff, ArrowDown, ArrowUp, ArrowUpDown,
  Calculator, ChevronDown,
} from "lucide-react";
import { InfoMetrica } from "@/components/metricas/InfoMetrica";
import {
  CabecalhoOrdenavel,
  LINHA_CABECALHO_COLADO,
  type DirecaoOrdenacao,
} from "@/components/tabela/CabecalhoOrdenavel";
import {
  RodapePaginacao,
  lerTamanhoPaginaSalvo,
  type PageSizeOption,
} from "@/components/tabela/RodapePaginacao";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";
import { nomeExibicao } from "@/lib/parceiros/nome";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

type CustoStatus = "real" | "interino" | "ausente" | string;

interface CockpitRow {
  sku: string;
  cod_cadastro: string | null;
  foto_url: string | null;
  margem_contribuicao: number | null;
  margem_contribuicao_pct: number | null;
  receita_b2b: number | null;
  receita_b2c: number | null;
  un_b2b: number | null;
  un_b2c: number | null;
  margem_contribuicao_b2b: number | null;
  margem_contribuicao_b2c: number | null;
  margem_un_b2b: number | null;
  margem_un_b2c: number | null;
  markup_b2b: number | null;
  markup_b2c: number | null;
  markup: number | null;
  preco_medio_b2b: number | null;
  preco_medio_b2c: number | null;
  gmroi: number | null;
  nome_comercial: string | null;
  linha: string | null;
  colecao: string | null;
  grupo: string | null;
  cor_nome: string | null;
  curva: "A" | "B" | "C" | "sem_venda" | string | null;
  un_vendidas: number | null;
  receita: number | null;
  pedidos: number | null;
  clientes: number | null;
  ultima_venda: string | null;
  dias_sem_vender: number | null;
  un_por_dia: number | null;
  un_canceladas: number | null;
  receita_cancelada: number | null;
  un_perdidas: number | null;
  receita_perdida: number | null;
  receita_reprocessada: number | null;
  reservado_aguardando_produto: number | null;
  custo: number | null;
  custo_status: CustoStatus | null;
  preco_b2b: number | null;
  resultado_pct_b2b: number | null;
  abaixo_piso_b2b: boolean | null;
  preco_b2c: number | null;
  resultado_pct_b2c: number | null;
  abaixo_piso_b2c: boolean | null;
  estoque_base: number | null;
  reservado: number | null;
  estoque_virtual: number | null;
  tem_razao: boolean | null;
  fase: string | null;
  estoque_por_centro: Record<string, number> | null;
  status_venda: string | null;
  dias_desde_contagem: number | null;
  cobertura_dias: number | null;
  capital_parado: number | null;
  preco_medio_realizado: number | null;
  despesas_variaveis_un: number | null;
  credito_un: number | null;
  margem_contribuicao_un: number | null;
  dias_janela: number | null;
  preco_divergente_bling: boolean | null;
  preco_no_bling: number | null;
}

interface CarteiraResumo {
  skus_ativos: number | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  receita_periodo: number | null;
  margem_contribuicao_total: number | null;
  margem_contribuicao_pct: number | null;
  receita_b2b: number | null;
  receita_b2c: number | null;
  margem_contribuicao_b2b: number | null;
  margem_contribuicao_b2c: number | null;
  margem_contribuicao_pct_b2b: number | null;
  margem_contribuicao_pct_b2c: number | null;
  margem_un_b2b: number | null;
  margem_un_b2c: number | null;
  markup_b2b: number | null;
  markup_b2c: number | null;
  markup_carteira: number | null;
  pct_receita_com_margem: number | null;
  gmroi_carteira: number | null;
  skus_gmroi_baixo: number | null;
  receita_cancelada: number | null;
  pct_cancelado: number | null;
  receita_perdida: number | null;
  receita_reprocessada: number | null;
  pct_perda_real: number | null;
  skus_pre_venda: number | null;
  un_aguardando_produto: number | null;
  curva_a: number | null;
  curva_b: number | null;
  curva_c: number | null;
  sem_venda: number | null;
  custo_real: number | null;
  custo_interino: number | null;
  custo_ausente: number | null;
  estoque_com_razao: number | null;
  estoque_saldo_bling: number | null;
  capital_lastreado: number | null;
  capital_fragil: number | null;
  capital_sem_venda: number | null;
  abaixo_do_piso: number | null;
  preco_divergente_bling: number | null;
  cobertura_abaixo_30d: number | null;
  sem_venda_ativos: number | null;
  sem_venda_pre_venda: number | null;
  skus_fase_ativo: number | null;
}

type ColunaProduto =
  | "cod" | "nome" | "curva" | "vendido" | "receita" | "margem" | "custo"
  | "markup" | "mb2b" | "mb2c" | "virtual" | "cobertura" | "capital" | "gmroi";

type OrdenacaoProduto = { coluna: ColunaProduto; dir: DirecaoOrdenacao };

// ─────────────────────────────────────────────────────────────
// Constantes / helpers
// ─────────────────────────────────────────────────────────────

/** Padrao da tela: quem fatura mais primeiro. */
const ORDEM_PADRAO_PRODUTO: OrdenacaoProduto = { coluna: "receita", dir: "desc" };

/** Texto sobe; numero desce. Curva sobe: A primeiro. */
const DIR_INICIAL_PRODUTO: Record<ColunaProduto, DirecaoOrdenacao> = {
  cod: "asc", nome: "asc", curva: "asc", vendido: "desc", receita: "desc",
  margem: "desc", custo: "desc", markup: "desc", mb2b: "desc", mb2c: "desc", virtual: "desc",
  cobertura: "desc", capital: "desc", gmroi: "desc",
};

/** Ordem de negocio da curva — nao alfabetica. */
const ORDEM_CURVA: Record<string, number> = { A: 0, B: 1, C: 2, sem_venda: 3 };

const CHAVE_PAGINA_PRODUTOS = "fetely:produtos:cockpit:page-size";

/** CasaHeader = 4rem. Mesmo numero que ancora o `top-16` da faixa de carteira. */
const ALTURA_CASA_HEADER = 64;

function formatNum(n: number | null | undefined, digits = 0) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(v);
}

function formatPct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${Number(n).toFixed(1)}%`;
}

// Views guardam margem como razão decimal (0.2633 = 26,33%). Multiplica antes de exibir.
function formatPctRatio(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(Number(n) * 100).toFixed(1)}%`;
}

function formatDateBRShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Cabeçalho ordenável de métrica: mesmo comportamento do CabecalhoOrdenavel,
 * com o "i" do InfoMetrica ao lado do rótulo. Vive aqui (e não no componente
 * compartilhado) porque o InfoMetrica é peça desta tela.
 */
function CabMetrica({
  rotulo,
  slug,
  className,
  alinharDireita,
  dir,
  onOrdenar,
}: {
  rotulo: string;
  slug: string;
  className?: string;
  alinharDireita?: boolean;
  dir: DirecaoOrdenacao | null;
  onOrdenar: () => void;
}) {
  return (
    <TableHead
      className={cn("group", className)}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <span className={cn("inline-flex items-center gap-1", alinharDireita && "w-full justify-end")}>
        <button
          type="button"
          onClick={onOrdenar}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-foreground",
            dir && "text-foreground",
          )}
          title={
            dir === "asc"
              ? "Crescente — clique para inverter"
              : dir === "desc"
                ? "Decrescente — clique para voltar à ordenação padrão"
                : `Ordenar por ${rotulo}`
          }
        >
          {rotulo}
          {dir === "asc" ? (
            <ArrowUp className="h-3 w-3" />
          ) : dir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-40" />
          )}
        </button>
        <InfoMetrica slug={slug} />
      </span>
    </TableHead>
  );
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

const CURVA_STYLE: Record<string, string> = {
  A: "bg-success/10 text-success border-success/20",
  B: "bg-info/10 text-info border-info/20",
  C: "bg-muted text-muted-foreground border-border",
  sem_venda: "bg-warning/10 text-warning border-warning/20",
};

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function Produtos() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [curvaFiltro, setCurvaFiltro] = useState("todas");
  const [cdFiltro, setCdFiltro] = useState("todos");
  const [margemFiltro, setMargemFiltro] = useState("todas");
  const [gmroiFiltro, setGmroiFiltro] = useState("todos");
  const [colecaoFiltro, setColecaoFiltro] = useState("todas");
  const [grupoFiltro, setGrupoFiltro] = useState("todos");
  const [faseFiltro, setFaseFiltro] = useState("todas");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoProduto>(ORDEM_PADRAO_PRODUTO);
  const [pagina, setPagina] = useState(1);
  const [tamanhoPagina, setTamanhoPagina] = useState(() =>
    lerTamanhoPaginaSalvo(CHAVE_PAGINA_PRODUTOS),
  );
  const [skuAberto, setSkuAberto] = useState<string | null>(null);

  const ordenarColuna = (coluna: ColunaProduto) => {
    setOrdenacao((atual) => {
      if (atual.coluna !== coluna) return { coluna, dir: DIR_INICIAL_PRODUTO[coluna] };
      const invertida: DirecaoOrdenacao = atual.dir === "asc" ? "desc" : "asc";
      // Fechou o ciclo: volta ao padrao da tela (receita, maior primeiro).
      return invertida === DIR_INICIAL_PRODUTO[coluna] ? ORDEM_PADRAO_PRODUTO : { coluna, dir: invertida };
    });
  };

  useEffect(() => {
    setPagina(1);
  }, [ordenacao]);


  const cockpitQuery = useQuery({
    queryKey: ["vw_produto_cockpit"],
    // CARGA-DO-BANCO (09/09/2026): view composta, cara. Cache maior evita
    // refetch em cascata quando várias abas estão abertas.
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<CockpitRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_produto_cockpit")
        .select("*")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as CockpitRow[];
    },
  });

  const lista = cockpitQuery.data ?? [];

  const faixasQuery = useQuery({
    queryKey: ["metrica-faixa"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<MetricaFaixa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("metrica_faixa")
        .select("metrica_slug, rotulo, minimo, maximo, tom, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as MetricaFaixa[];
    },
  });
  const centrosQuery = useQuery({
    queryKey: ["centros-distribuicao"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ codigo: string; rotulo_curto: string | null; nome: string | null; ordem: number | null }[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("centro_distribuicao")
        .select("codigo, rotulo_curto, nome, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });
  const fasesQuery = useQuery({
    queryKey: ["produto-fase-dim"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<{ slug: string; nome: string | null; ordem: number | null }[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("produto_fase_dim")
        .select("slug, nome, ordem")
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });

  const faixas = faixasQuery.data ?? [];
  const faixasMargem = useMemo(() => faixas.filter((f) => f.metrica_slug === "margem_contribuicao"), [faixas]);
  const faixasGmroi = useMemo(() => faixas.filter((f) => f.metrica_slug === "gmroi"), [faixas]);
  const centros = centrosQuery.data ?? [];
  const fasesDim = fasesQuery.data ?? [];

  const rotuloCd = (codigo: string) => {
    const c = centros.find((x) => x.codigo === codigo);
    return c?.rotulo_curto ?? c?.nome ?? codigo;
  };
  const rotuloFase = (slug: string) => fasesDim.find((f) => f.slug === slug)?.nome ?? slug;

  const cdsOpcoes = useMemo(() => {
    const presentes = new Set<string>();
    lista.forEach((p) => Object.keys(p.estoque_por_centro ?? {}).forEach((k) => presentes.add(k)));
    return centros.map((c) => c.codigo).filter((c) => presentes.has(c));
  }, [lista, centros]);
  const colecoesOpcoes = useMemo(
    () => [...new Set(lista.map((p) => p.colecao).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [lista],
  );
  const gruposOpcoes = useMemo(
    () => [...new Set(lista.map((p) => p.grupo).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [lista],
  );
  const fasesOpcoes = useMemo(() => {
    const ord = (s: string) => fasesDim.find((f) => f.slug === s)?.ordem ?? 9999;
    return [...new Set(lista.map((p) => p.fase).filter((x): x is string => !!x))].sort((a, b) => ord(a) - ord(b));
  }, [lista, fasesDim]);

  const filtroAtivo =
    busca.trim() !== "" || curvaFiltro !== "todas" || cdFiltro !== "todos" || margemFiltro !== "todas" ||
    gmroiFiltro !== "todos" || colecaoFiltro !== "todas" || grupoFiltro !== "todos" || faseFiltro !== "todas";

  function limparFiltros() {
    setBusca(""); setCurvaFiltro("todas"); setCdFiltro("todos"); setMargemFiltro("todas");
    setGmroiFiltro("todos"); setColecaoFiltro("todas"); setGrupoFiltro("todos"); setFaseFiltro("todas");
    setPagina(1);
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const faixaMargemSel = margemFiltro.startsWith("f") ? faixasMargem[Number(margemFiltro.slice(1))] : undefined;
    const faixaGmroiSel = gmroiFiltro.startsWith("f") ? faixasGmroi[Number(gmroiFiltro.slice(1))] : undefined;
    const base = lista.filter((p) => {
      if (curvaFiltro !== "todas") {
        if (curvaFiltro === "sem_venda" && p.curva !== "sem_venda") return false;
        if (curvaFiltro !== "sem_venda" && p.curva !== curvaFiltro) return false;
      }
      if (cdFiltro === "sem") {
        if (Object.keys(p.estoque_por_centro ?? {}).length > 0) return false;
      } else if (cdFiltro !== "todos") {
        if (!(Number(p.estoque_por_centro?.[cdFiltro] ?? 0) > 0)) return false;
      }
      if (margemFiltro === "abaixo" && !(p.abaixo_piso_b2b || p.abaixo_piso_b2c)) return false;
      if (faixaMargemSel && !dentroFaixa(faixaMargemSel, p.margem_contribuicao_pct)) return false;
      if (faixaGmroiSel && !dentroFaixa(faixaGmroiSel, p.gmroi)) return false;
      if (colecaoFiltro !== "todas" && p.colecao !== colecaoFiltro) return false;
      if (grupoFiltro !== "todos" && p.grupo !== grupoFiltro) return false;
      if (faseFiltro !== "todas" && p.fase !== faseFiltro) return false;
      if (!q) return true;
      return (
        p.cod_cadastro?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q)
      );
    });
    const dir = ordenacao.dir === "asc" ? 1 : -1;
    const valorDe = (p: CockpitRow): string | number | null => {
      switch (ordenacao.coluna) {
        case "cod": return p.cod_cadastro || null;
        case "nome": return p.nome_comercial ?? null;
        case "curva": return p.curva ? ORDEM_CURVA[p.curva] ?? null : null;
        case "vendido": return Number(p.un_vendidas ?? 0);
        case "receita": return Number(p.receita ?? 0);
        case "margem": return p.margem_contribuicao == null ? null : Number(p.margem_contribuicao);
        case "custo": return p.custo == null ? null : Number(p.custo);
        case "markup": return p.markup == null ? null : Number(p.markup);
        case "mb2b": return p.resultado_pct_b2b == null ? null : Number(p.resultado_pct_b2b);
        case "mb2c": return p.resultado_pct_b2c == null ? null : Number(p.resultado_pct_b2c);
        case "virtual": return Number(p.estoque_virtual ?? 0);
        case "cobertura": return p.cobertura_dias == null ? null : Number(p.cobertura_dias);
        case "capital": return p.capital_parado == null ? null : Number(p.capital_parado);
        case "gmroi": return p.gmroi == null ? null : Number(p.gmroi);
        default: return null;
      }
    };
    return [...base].sort((a, b) => {
      const va = valorDe(a);
      const vb = valorDe(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb), "pt-BR", { numeric: true }) * dir;
      }
      return (Number(va) - Number(vb)) * dir;
    });
  }, [lista, busca, curvaFiltro, cdFiltro, margemFiltro, gmroiFiltro, colecaoFiltro, grupoFiltro, faseFiltro, faixasMargem, faixasGmroi, ordenacao]);

  // Cartões seguem os filtros: a chave é a lista de SKUs do resultado filtrado
  // (todas as páginas). Sem filtro → "" → RPC com p_skus null (carteira inteira).
  const chaveResumo = useMemo(
    () => (filtroAtivo ? `F:${filtrados.map((p) => p.sku).sort().join("|")}` : ""),
    [filtroAtivo, filtrados],
  );
  const [chaveResumoDeb, setChaveResumoDeb] = useState(chaveResumo);
  useEffect(() => {
    const t = setTimeout(() => setChaveResumoDeb(chaveResumo), 300);
    return () => clearTimeout(t);
  }, [chaveResumo]);

  const resumoQuery = useQuery({
    queryKey: ["cockpit-resumo", chaveResumoDeb],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CarteiraResumo | null> => {
      if (chaveResumoDeb === "F:") return {} as CarteiraResumo; // filtro sem resultado: cartões zerados
      const p_skus = chaveResumoDeb === "" ? null : chaveResumoDeb.slice(2).split("|");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_produto_cockpit_resumo", { p_skus });
      if (error) throw error;
      return (data ?? null) as CarteiraResumo | null;
    },
  });

  useEffect(() => {
    if (resumoQuery.error) toast.error(formatError(resumoQuery.error));
  }, [resumoQuery.error]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / tamanhoPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice((paginaAtual - 1) * tamanhoPagina, paginaAtual * tamanhoPagina);

  function handleAtualizar() {
    cockpitQuery.refetch();
    resumoQuery.refetch();
  }

  const resumo = resumoQuery.data;

  // TOPO-COLADO-SE-MEDE: o cabecalho da tabela cola logo abaixo da faixa, e a
  // altura dela muda (7 cards quebram linha em tela menor). Mede, nao chuta.
  const faixaRef = useRef<HTMLDivElement>(null);
  const [alturaFaixa, setAlturaFaixa] = useState(0);

  useEffect(() => {
    const el = faixaRef.current;
    if (!el) return;
    const medir = () => setAlturaFaixa(el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [resumoQuery.isLoading, resumo]);

  const totalCols = 15;

  return (
    <PageShell className="animate-casa-fade-in">
      <div
        className="space-y-4"
        style={{ "--fila-topo-colado": `${ALTURA_CASA_HEADER + alturaFaixa}px` } as CSSProperties}
      >
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
        ]}
        title="Produtos"
        subtitle="Cockpit de negócio: venda, margem e capital por produto. Cadastro e correções ficam na Mesa do Produto e na Conciliação."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleAtualizar}
            disabled={cockpitQuery.isFetching || resumoQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", (cockpitQuery.isFetching || resumoQuery.isFetching) && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {/* NÍVEL 1 — Faixa de carteira */}
      {filtroAtivo && (
        <p className="text-xs text-muted-foreground">
          Cartões refletem os filtros aplicados ({filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}).
        </p>
      )}
      <FaixaCarteira refBloco={faixaRef} resumo={resumo} isLoading={resumoQuery.isLoading} />

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por código, SKU ou nome"
            className="pl-9"
          />
        </div>
        <Select value={curvaFiltro} onValueChange={(v) => { setCurvaFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={curvaFiltro !== "todas"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as curvas</SelectItem>
            <SelectItem value="A">Curva A</SelectItem>
            <SelectItem value="B">Curva B</SelectItem>
            <SelectItem value="C">Curva C</SelectItem>
            <SelectItem value="sem_venda">Sem venda</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cdFiltro} onValueChange={(v) => { setCdFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={cdFiltro !== "todos"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os CDs</SelectItem>
            {cdsOpcoes.map((c) => (
              <SelectItem key={c} value={c}>{rotuloCd(c)}</SelectItem>
            ))}
            <SelectItem value="sem">Sem estoque</SelectItem>
          </SelectContent>
        </Select>
        <Select value={margemFiltro} onValueChange={(v) => { setMargemFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={margemFiltro !== "todas"} className="w-[170px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas margens</SelectItem>
            <SelectItem value="abaixo">Abaixo do piso</SelectItem>
            {faixasMargem.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Margem de contribuição</SelectLabel>
                  {faixasMargem.map((f, i) => (
                    <SelectItem key={i} value={`f${i}`}>{f.rotulo}</SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>
        <Select value={gmroiFiltro} onValueChange={(v) => { setGmroiFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={gmroiFiltro !== "todos"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo GMROI</SelectItem>
            {faixasGmroi.map((f, i) => (
              <SelectItem key={i} value={`f${i}`}>{f.rotulo}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={colecaoFiltro} onValueChange={(v) => { setColecaoFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={colecaoFiltro !== "todas"} className="w-[160px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as coleções</SelectItem>
            {colecoesOpcoes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={grupoFiltro} onValueChange={(v) => { setGrupoFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={grupoFiltro !== "todos"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os grupos</SelectItem>
            {gruposOpcoes.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={faseFiltro} onValueChange={(v) => { setFaseFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={faseFiltro !== "todas"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as fases</SelectItem>
            {fasesOpcoes.map((f) => <SelectItem key={f} value={f}>{rotuloFase(f)}</SelectItem>)}
          </SelectContent>
        </Select>
        {filtroAtivo && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {/* Tabela */}
      <div className="rounded-md border bg-card">
        <TooltipProvider delayDuration={200}>
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className={LINHA_CABECALHO_COLADO}>
                <CabecalhoOrdenavel rotulo="Cód." className="w-[110px]" dir={ordenacao.coluna === "cod" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("cod")} />
                <TableHead className="w-[52px]" aria-label="Foto" />
                <CabecalhoOrdenavel rotulo="Produto" dir={ordenacao.coluna === "nome" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("nome")} />
                <CabMetrica rotulo="Curva" slug="curva_abc" className="w-[100px]" dir={ordenacao.coluna === "curva" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("curva")} />
                <CabMetrica rotulo="Vendido" slug="unidades_vendidas" className="w-[100px] text-right" alinharDireita dir={ordenacao.coluna === "vendido" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("vendido")} />
                <CabMetrica rotulo="Receita" slug="receita" className="w-[120px] text-right" alinharDireita dir={ordenacao.coluna === "receita" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("receita")} />
                <CabMetrica rotulo="Margem" slug="margem_contribuicao" className="w-[130px] text-right" alinharDireita dir={ordenacao.coluna === "margem" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("margem")} />
                <CabMetrica rotulo="Custo" slug="custo" className="w-[130px] text-right" alinharDireita dir={ordenacao.coluna === "custo" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("custo")} />
                <CabMetrica rotulo="Res. B2B" slug="resultado_b2b" className="w-[100px] text-right" alinharDireita dir={ordenacao.coluna === "mb2b" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("mb2b")} />
                <CabMetrica rotulo="Res. B2C" slug="resultado_b2c" className="w-[100px] text-right" alinharDireita dir={ordenacao.coluna === "mb2c" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("mb2c")} />
                <CabMetrica rotulo="Virtual" slug="estoque_virtual" className="w-[110px] text-right" alinharDireita dir={ordenacao.coluna === "virtual" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("virtual")} />
                <CabMetrica rotulo="Cobertura" slug="cobertura_dias" className="w-[100px] text-right" alinharDireita dir={ordenacao.coluna === "cobertura" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("cobertura")} />
                <CabMetrica rotulo="Capital" slug="capital_estoque" className="w-[110px] text-right" alinharDireita dir={ordenacao.coluna === "capital" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("capital")} />
                <CabMetrica rotulo="GMROI" slug="gmroi" className="w-[90px] text-right" alinharDireita dir={ordenacao.coluna === "gmroi" ? ordenacao.dir : null} onOrdenar={() => ordenarColuna("gmroi")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {cockpitQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={totalCols} className="text-center py-12 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={totalCols} className="text-center py-12 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((p) => {
                  const virtual = Number(p.estoque_virtual ?? 0);
                  const cobertura = p.cobertura_dias;
                  const coberturaClass =
                    cobertura == null ? "text-muted-foreground"
                      : cobertura < 30 ? "text-destructive font-medium"
                        : cobertura < 60 ? "text-warning"
                          : "text-muted-foreground";
                  const curva = (p.curva ?? "") as string;
                  return (
                    <TableRow
                      key={p.sku}
                      className="cursor-pointer"
                      onClick={() => setSkuAberto(p.sku)}
                    >
                      <TableCell className="font-mono text-xs">{p.cod_cadastro ?? p.sku}</TableCell>
                      <TableCell className="w-[52px]">
                        {p.foto_url ? (
                          <img
                            src={p.foto_url}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 rounded-md object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <ImageOff className="h-4 w-4" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <div className="font-medium leading-tight">{p.nome_comercial ?? "—"}</div>
                          {virtual <= 0 && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-5 border-destructive/40 text-destructive bg-destructive/10">
                              Sem Estoque
                            </Badge>
                          )}
                        </div>
                        {p.linha && <div className="text-xs text-muted-foreground">{p.linha}</div>}
                      </TableCell>
                      <TableCell>
                        {curva ? (
                          <Badge variant="outline" className={cn("font-normal", CURVA_STYLE[curva] ?? "")}>
                            {curva === "sem_venda" ? "sem venda" : curva}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{formatNum(p.un_vendidas)} un</div>
                        <div className="text-xs text-muted-foreground">{formatNum(p.un_por_dia, 1)}/dia</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div>{formatBRL(p.receita ?? 0)}</div>
                        {Number(p.receita_b2c ?? 0) > 0 && (
                          <div className="text-xs text-muted-foreground">B2C {formatBRL(p.receita_b2c)}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.margem_contribuicao == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <div>{formatBRL(p.margem_contribuicao)}</div>
                            {p.margem_contribuicao_pct != null && (
                              <div className="text-xs text-muted-foreground">{formatPct(p.margem_contribuicao_pct)}</div>
                            )}
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.custo == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{formatBRL(p.custo)}</span>
                            {p.custo_status === "interino" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-warning/10 text-warning border-warning/20">int.</Badge>
                            )}
                            {p.custo_status === "ausente" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-destructive/10 text-destructive border-destructive/20">s/ custo</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right tabular-nums",
                        p.abaixo_piso_b2b && "text-destructive font-medium",
                      )}>
                        {formatPctRatio(p.resultado_pct_b2b)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right tabular-nums",
                        p.abaixo_piso_b2c && "text-destructive font-medium",
                      )}>
                        {formatPctRatio(p.resultado_pct_b2c)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={cn(virtual < 0 && "text-destructive font-medium")}>
                            {formatNum(virtual)}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full inline-block",
                                  p.tem_razao ? "bg-success" : "bg-warning",
                                )}
                                aria-hidden
                              />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              {p.tem_razao ? "Lastreado no razão SNCF" : "Saldo Bling — não lastreado"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        {cdFiltro !== "todos" && cdFiltro !== "sem" && (
                          <div className="text-[10px] text-muted-foreground">
                            {formatNum(Number(p.estoque_por_centro?.[cdFiltro] ?? 0))} no {rotuloCd(cdFiltro)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cobertura == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : p.tem_razao ? (
                          <span className={coberturaClass}>{formatNum(cobertura)}d</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn(coberturaClass, "italic cursor-help")}>{formatNum(cobertura)}d</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              Estimativa frágil: base vem do saldo Bling, não do razão.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.capital_parado == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : formatBRL(p.capital_parado)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.gmroi == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={classeTom(faixaDe(faixasGmroi, Number(p.gmroi))?.tom)}>
                            {Number(p.gmroi).toFixed(2)}×
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      <RodapePaginacao
        total={filtrados.length}
        pagina={paginaAtual}
        tamanhoPagina={tamanhoPagina}
        chavePreferencia={CHAVE_PAGINA_PRODUTOS}
        onPagina={setPagina}
        onTamanhoPagina={(n) => setTamanhoPagina(n as PageSizeOption)}
      />

      {/* NÍVEL 3 — Painel do SKU */}
      <PainelSku
        sku={skuAberto}
        rowCache={lista}
        onClose={() => setSkuAberto(null)}
        onInvalidate={() => qc.invalidateQueries({ queryKey: ["vw_produto_cockpit"] })}
      />
      </div>
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────
// Faixa (Nível 1)
// ─────────────────────────────────────────────────────────────

function faixaFontClass(valor: React.ReactNode): string {
  const s = typeof valor === "string" || typeof valor === "number" ? String(valor) : "";
  const n = s.length;
  if (n >= 14) return "text-lg";
  if (n >= 10) return "text-xl";
  return "text-2xl";
}

function FaixaBloco({
  label, valor, contexto, valorClass, slug,
}: {
  label: string;
  valor: React.ReactNode;
  contexto: React.ReactNode;
  valorClass?: string;
  slug?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-4 py-3 min-w-0">
      <div className="group inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
        {slug && <InfoMetrica slug={slug} />}
      </div>
      <div className={cn(faixaFontClass(valor), "font-medium tabular-nums leading-none mt-1", valorClass)}>{valor}</div>
      <div className="text-xs text-muted-foreground mt-1 leading-tight">{contexto}</div>
    </div>
  );
}

function FaixaCarteira({
  resumo,
  isLoading,
  refBloco,
}: {
  resumo: CarteiraResumo | null | undefined;
  isLoading: boolean;
  refBloco?: Ref<HTMLDivElement>;
}) {
  if (isLoading) {
    return (
      <div ref={refBloco} className="sticky top-16 z-20 -mx-6 grid grid-cols-2 gap-3 bg-background px-6 py-2 md:grid-cols-4 xl:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="rounded-md border bg-card px-4 py-3 h-[92px] animate-pulse" />
        ))}
      </div>
    );
  }
  if (!resumo) return null;
  const capitalTotal = Number(resumo.capital_lastreado ?? 0) + Number(resumo.capital_fragil ?? 0);
  const semVenda = Number(resumo.sem_venda_ativos ?? 0);
  const semVendaPreVenda = Number(resumo.sem_venda_pre_venda ?? 0);
  const capSemVenda = Number(resumo.capital_sem_venda ?? 0);
  const perdida = Number(resumo.receita_perdida ?? 0);
  const reprocessada = Number(resumo.receita_reprocessada ?? 0);
  const preVenda = Number(resumo.skus_pre_venda ?? 0);
  const aguardandoProduto = Number(resumo.un_aguardando_produto ?? 0);

  return (
    <div ref={refBloco} className="sticky top-16 z-20 -mx-6 grid grid-cols-2 gap-3 bg-background px-6 py-2 md:grid-cols-4 xl:grid-cols-9">
      <FaixaBloco
        label="Receita do período"
        slug="receita"
        valor={formatBRL(resumo.receita_periodo ?? 0)}
        contexto={
          <div className="space-y-0.5">
            <div>{formatDateBRShort(resumo.janela_inicio)} a {formatDateBRShort(resumo.janela_fim)}</div>
            <div className="text-[11px] text-muted-foreground">
              B2B {formatBRL(resumo.receita_b2b ?? 0)} · B2C {formatBRL(resumo.receita_b2c ?? 0)}
            </div>
          </div>
        }
      />
      <FaixaBloco
        label="Margem de contribuição"
        slug="margem_contribuicao"
        valor={formatBRL(resumo.margem_contribuicao_total ?? 0)}
        contexto={
          <div className="space-y-0.5">
            <div>{formatPct(resumo.margem_contribuicao_pct)} da receita</div>
            <div className="text-[11px] text-muted-foreground">
              após despesas variáveis · sobre {formatPct(resumo.pct_receita_com_margem)} da receita
            </div>
            <div className="text-[11px] text-muted-foreground">
              B2B {formatPct(resumo.margem_contribuicao_pct_b2b)} · B2C {formatPct(resumo.margem_contribuicao_pct_b2c)}
            </div>
          </div>
        }
      />
      <FaixaBloco
        label="GMROI"
        slug="gmroi"
        valor={resumo.gmroi_carteira == null ? "—" : `${Number(resumo.gmroi_carteira).toFixed(2)}×`}
        contexto={
          <div className="space-y-0.5">
            <div>margem/ano por R$ 1 em estoque</div>
            <div className="text-[11px] text-muted-foreground">
              {formatNum(resumo.skus_gmroi_baixo)} SKUs abaixo de 0,5
            </div>
          </div>
        }
      />
      <FaixaBloco
        label="Venda perdida"
        slug="venda_perdida"
        valorClass="text-destructive"
        valor={formatBRL(perdida)}
        contexto={
          <div className="space-y-0.5">
            <div>{formatPct(resumo.pct_perda_real)} do valor pedido</div>
            <div className="text-[11px] text-muted-foreground">+ {formatBRL(reprocessada)} reprocessado (mesma venda, outro pedido)</div>
          </div>
        }
      />
      <FaixaBloco
        label="Concentração"
        slug="concentracao_receita"
        valor={<>{formatNum(resumo.curva_a)} <span className="text-base text-muted-foreground">SKUs</span></>}
        contexto={<>fazem 50% da receita · B {formatNum(resumo.curva_b)} · C {formatNum(resumo.curva_c)}</>}
      />
      <FaixaBloco
        label="Sem venda"
        slug="sem_venda"
        valorClass={semVenda > 0 ? "text-warning" : undefined}
        valor={formatNum(semVenda)}
        contexto={
          <>
            de {formatNum(resumo.skus_fase_ativo)} ativos
            {semVendaPreVenda > 0 && <> · {formatNum(semVendaPreVenda)} em pré-venda</>}
          </>
        }
      />
      <FaixaBloco
        label="Capital parado"
        slug="capital_parado"
        valor={formatBRL(capitalTotal)}
        contexto={
          <div className="space-y-0.5">
            <div className="text-success">{formatBRL(resumo.capital_lastreado)} lastreado</div>
            <div className="text-warning">{formatBRL(resumo.capital_fragil)} frágil</div>
          </div>
        }
      />
      <FaixaBloco
        label="Capital sem giro"
        slug="capital_sem_giro"
        valorClass={capSemVenda > 0 ? "text-destructive" : undefined}
        valor={formatBRL(capSemVenda)}
        contexto="preso em SKU que nunca vendeu"
      />
      <FaixaBloco
        label="Pré-venda"
        slug="pre_venda"
        valorClass={preVenda > 0 ? "text-info" : undefined}
        valor={<>{formatNum(preVenda)} <span className="text-base text-muted-foreground">SKUs</span></>}
        contexto={<>{formatNum(aguardandoProduto)} un vendidas aguardando mercadoria</>}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Painel do SKU (Nível 3)
// ─────────────────────────────────────────────────────────────

const ESTAGIOS_NAO_RESERVAM = new Set([
  "cancelado", "entregue", "em_transporte", "recuperacao_venda",
]);

interface SncfProdutoDetalhe {
  sku: string;
  ean: string | null;
  nome_comercial: string | null;
  nome_completo: string | null;
  marca: string | null;
  linha: string | null;
  colecao: string | null;
  grupo: string | null;
  tipo: string | null;
  cor_nome: string | null;
  tamanho_numero: string | null;
  material: string | null;
  tipo_embalagem: string | null;
  peso_g: number | null;
  multiplos: number | null;
  altura_cm: number | null;
  largura_cm: number | null;
  profundidade_cm: number | null;
  ncm: string | null;
  cest: string | null;
  origem_fisc: string | null;
  origem_prod: string | null;
}

interface MovRow {
  data_mov: string | null;
  tipo: string | null;
  quantidade: number | null;
  origem: string | null;
  referencia: string | null;
  obs: string | null;
}

interface ReservaRow {
  quantidade: number | null;
  pedidos: {
    id_externo: string | null;
    estagio: string | null;
    parceiro_id: string | null;
    parceiros_comerciais: {
      nome_fantasia: string | null;
      razao_social: string | null;
    } | null;
  } | null;
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
        {titulo}
      </h3>
      <div className="h-px bg-border mb-3" />
      {children}
    </section>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{children}</div>
    </div>
  );
}

function ou(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  return v;
}

function PainelSku({
  sku, rowCache, onClose,
}: {
  sku: string | null;
  rowCache: CockpitRow[];
  onClose: () => void;
  onInvalidate: () => void;
}) {
  const open = sku != null;
  const row = sku ? rowCache.find((r) => r.sku === sku) ?? null : null;

  const { data: cadastro, isLoading: loadingCad } = useQuery({
    queryKey: ["cockpit-sku-cadastro", sku],
    enabled: !!sku,
    queryFn: async (): Promise<SncfProdutoDetalhe | null> => {
      const { data, error } = await supabase
        .from("sncf_produtos")
        .select("*")
        .eq("sku", sku!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as SncfProdutoDetalhe) ?? null;
    },
  });

  const { data: movs, isLoading: loadingMov } = useQuery({
    queryKey: ["cockpit-sku-mov", sku],
    enabled: !!sku,
    queryFn: async (): Promise<MovRow[]> => {
      const { data, error } = await supabase
        .from("movimentacao_estoque")
        .select("data_mov,tipo,quantidade,origem,referencia,obs")
        .eq("sku", sku!)
        .order("data_mov", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data as MovRow[]) ?? [];
    },
  });

  const { data: reservas, isLoading: loadingRes } = useQuery({
    queryKey: ["cockpit-sku-reservas", sku],
    enabled: !!sku,
    queryFn: async (): Promise<ReservaRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("pedido_itens")
        .select("quantidade, pedidos!inner(id_externo, estagio, parceiro_id, parceiros_comerciais(nome_fantasia, razao_social))")
        .eq("sku", sku!)
        .limit(50);
      if (error) throw error;
      const rows = (data as unknown as ReservaRow[]) ?? [];
      return rows
        .filter((r) => r.pedidos && !ESTAGIOS_NAO_RESERVAM.has(r.pedidos.estagio ?? ""))
        .slice(0, 20);
    },
  });

  function copiarSolicitacao() {
    if (!sku) return;
    const hoje = new Date().toLocaleDateString("pt-BR");
    const texto = `Correção de cadastro — FOP
SKU: ${sku}
Produto: ${row?.nome_comercial ?? ""}
Campo a corrigir: 
Valor atual: 
Valor correto: 
Solicitado por: SNCF · Cockpit de Produto · ${hoje}`;
    navigator.clipboard.writeText(texto).then(
      () => toast.success("Solicitação copiada"),
      () => toast.error("Não foi possível copiar"),
    );
  }

  const dimensoes = cadastro
    ? [cadastro.altura_cm, cadastro.largura_cm, cadastro.profundidade_cm].some((v) => v != null)
      ? `${cadastro.altura_cm ?? "—"} × ${cadastro.largura_cm ?? "—"} × ${cadastro.profundidade_cm ?? "—"} cm`
      : null
    : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {sku && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">{sku}</SheetTitle>
              <SheetDescription>{row?.nome_comercial ?? ""}</SheetDescription>
            </SheetHeader>
            {row?.foto_url && (
              <div className="mt-4">
                <img
                  src={row.foto_url}
                  alt={row.nome_comercial ?? sku}
                  loading="lazy"
                  className="h-40 w-40 rounded-md object-cover"
                />
              </div>
            )}

            {/* 1. Cadastro (FOP) */}
            <Secao titulo="Cadastro (FOP)">
              <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning mb-3 flex items-start justify-between gap-3">
                <span>Cadastro e preço são do FOP. Correções devem ser feitas lá e refletem aqui automaticamente.</span>
                <Button size="sm" variant="outline" onClick={copiarSolicitacao} className="shrink-0 h-7 gap-1.5">
                  <Copy className="h-3 w-3" />
                  Copiar solicitação de correção
                </Button>
              </div>
              {loadingCad ? (
                <div className="grid grid-cols-2 gap-3">
                  {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="SKU"><span className="font-mono">{cadastro?.sku ?? sku}</span></Field>
                  <Field label="Cód. cadastro"><span className="font-mono">{ou(row?.cod_cadastro)}</span></Field>
                  <Field label="EAN">{ou(cadastro?.ean)}</Field>
                  <Field label="Nome completo" className="col-span-2">{ou(cadastro?.nome_completo)}</Field>
                  <Field label="Marca">{ou(cadastro?.marca)}</Field>
                  <Field label="Linha">{ou(cadastro?.linha)}</Field>
                  <Field label="Coleção">{ou(cadastro?.colecao)}</Field>
                  <Field label="Grupo">{ou(cadastro?.grupo)}</Field>
                  <Field label="Tipo">{ou(cadastro?.tipo)}</Field>
                  <Field label="Cor">{ou(cadastro?.cor_nome)}</Field>
                  <Field label="Tamanho">{ou(cadastro?.tamanho_numero)}</Field>
                  <Field label="Material">{ou(cadastro?.material)}</Field>
                  <Field label="Embalagem">{ou(cadastro?.tipo_embalagem)}</Field>
                  <Field label="Peso">{cadastro?.peso_g != null ? `${cadastro.peso_g} g` : ou(null)}</Field>
                  <Field label="Múltiplos">{ou(cadastro?.multiplos)}</Field>
                  <Field label="Dimensões (A × L × P)" className="col-span-2">{ou(dimensoes)}</Field>
                </div>
              )}
            </Secao>

            {/* 2. Fiscal */}
            <Secao titulo="Fiscal">
              {loadingCad ? (
                <Skeleton className="h-16" />
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="NCM">{ou(cadastro?.ncm)}</Field>
                  <Field label="CEST">{ou(cadastro?.cest)}</Field>
                  <Field label="Origem fiscal">{ou(cadastro?.origem_fisc)}</Field>
                  <Field label="Origem produto">{ou(cadastro?.origem_prod)}</Field>
                </div>
              )}
            </Secao>

            {/* 3. Comercial */}
            <Secao titulo="Comercial">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Preço B2B">{row?.preco_b2b != null ? formatBRL(row.preco_b2b) : ou(null)}</Field>
                <Field label="Preço B2C">{row?.preco_b2c != null ? formatBRL(row.preco_b2c) : ou(null)}</Field>
                <Field label="Custo">
                  <span className="inline-flex items-center gap-2">
                    {row?.custo != null ? formatBRL(row.custo) : ou(null)}
                    {row?.custo_status === "interino" && (
                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/20">int.</Badge>
                    )}
                    {row?.custo_status === "ausente" && (
                      <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20">s/ custo</Badge>
                    )}
                  </span>
                </Field>
                <Field label="Margem B2B">
                  <span className={cn(row?.abaixo_piso_b2b && "text-destructive font-medium")}>
                    {formatPctRatio(row?.resultado_pct_b2b)}
                    {row?.abaixo_piso_b2b && <span className="text-xs ml-1">(abaixo do piso)</span>}
                  </span>
                </Field>
                <Field label="Margem B2C">
                  <span className={cn(row?.abaixo_piso_b2c && "text-destructive font-medium")}>
                    {formatPctRatio(row?.resultado_pct_b2c)}
                    {row?.abaixo_piso_b2c && <span className="text-xs ml-1">(abaixo do piso)</span>}
                  </span>
                </Field>
              </div>
              {row?.preco_divergente_bling && (
                <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
                  Preço divergente: FOP {row.preco_b2c != null ? formatBRL(row.preco_b2c) : "—"} · Bling {row.preco_no_bling != null ? formatBRL(row.preco_no_bling) : "—"}. A correção é no FOP.
                </div>
              )}
            </Secao>

            {/* 4. Venda */}
            <Secao titulo="Venda">
              {!row?.un_vendidas ? (
                <p className="text-sm text-muted-foreground">Este SKU nunca vendeu.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Un. vendidas">{formatNum(row.un_vendidas)}</Field>
                  <Field label="Receita">{formatBRL(row.receita ?? 0)}</Field>
                  <Field label="Pedidos">{formatNum(row.pedidos)}</Field>
                  <Field label="Clientes">{formatNum(row.clientes)}</Field>
                  <Field label="Última venda">{formatDateBR(row.ultima_venda)}</Field>
                  <Field label="Dias sem vender">{row.dias_sem_vender != null ? `${row.dias_sem_vender} dias` : ou(null)}</Field>
                  <Field label="Un / dia">{row.un_por_dia != null ? formatNum(row.un_por_dia, 2) : ou(null)}</Field>
                  <Field label="Venda perdida" className="col-span-2">
                    <span className={cn(Number(row.un_perdidas ?? 0) > 0 && "text-destructive font-medium")}>
                      {formatNum(row.un_perdidas)} un · {formatBRL(row.receita_perdida ?? 0)}
                    </span>
                  </Field>
                  <Field label="Reprocessado" className="col-span-2">
                    <span className="text-muted-foreground">{formatBRL(row.receita_reprocessada ?? 0)}</span>
                  </Field>
                  {Number(row.reservado_aguardando_produto ?? 0) > 0 && (
                    <Field label="Aguardando produto" className="col-span-2">
                      <span className="text-info">{formatNum(row.reservado_aguardando_produto)} un</span>
                    </Field>
                  )}
                </div>
              )}
            </Secao>

            {/* 5. Estoque */}
            <Secao titulo="Estoque">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Base">{formatNum(row?.estoque_base)}</Field>
                <Field label="Reservado">{formatNum(row?.reservado)}</Field>
                <Field label="Virtual">
                  <span className={cn((row?.estoque_virtual ?? 0) < 0 && "text-destructive font-medium")}>
                    {formatNum(row?.estoque_virtual)}
                  </span>
                </Field>
                <Field label="Fonte">
                  {row?.tem_razao ? (
                    <span className="text-success">Razão SNCF</span>
                  ) : (
                    <span className="text-warning">Saldo Bling — não lastreado</span>
                  )}
                </Field>
                <Field label="Status">{ou(row?.status_venda)}</Field>
                <Field label="Dias desde contagem">{row?.dias_desde_contagem != null ? `${row.dias_desde_contagem}d` : ou(null)}</Field>
                <Field label="Cobertura">{row?.cobertura_dias != null ? `${row.cobertura_dias}d` : ou(null)}</Field>
                <Field label="Capital parado">{row?.capital_parado != null ? formatBRL(row.capital_parado) : ou(null)}</Field>
              </div>
            </Secao>

            {/* 6. Movimentação no razão */}
            <Secao titulo="Movimentação no razão">
              {loadingMov ? (
                <Skeleton className="h-24" />
              ) : !movs || movs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem movimentação no razão — SKU ainda não onboardado por contagem.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Data</TableHead>
                        <TableHead className="h-8 text-xs">Tipo</TableHead>
                        <TableHead className="h-8 text-xs text-right">Qtd</TableHead>
                        <TableHead className="h-8 text-xs">Origem</TableHead>
                        <TableHead className="h-8 text-xs">Ref.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movs.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs py-1.5">{formatDateBRShort(m.data_mov)}</TableCell>
                          <TableCell className="text-xs py-1.5">{m.tipo ?? "—"}</TableCell>
                          <TableCell className={cn("text-xs py-1.5 text-right tabular-nums", (m.quantidade ?? 0) < 0 && "text-destructive")}>
                            {formatNum(m.quantidade)}
                          </TableCell>
                          <TableCell className="text-xs py-1.5">{m.origem ?? "—"}</TableCell>
                          <TableCell className="text-xs py-1.5 max-w-[140px] truncate" title={m.referencia ?? ""}>{m.referencia ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Secao>

            {/* 7. Pedidos reservando */}
            <Secao titulo="Pedidos reservando">
              {loadingRes ? (
                <Skeleton className="h-24" />
              ) : !reservas || reservas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pedido reservando este SKU.</p>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="h-8 text-xs">Pedido</TableHead>
                        <TableHead className="h-8 text-xs">Cliente</TableHead>
                        <TableHead className="h-8 text-xs text-right">Qtd</TableHead>
                        <TableHead className="h-8 text-xs">Estágio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reservas.map((r, i) => {
                        const cli = r.pedidos?.parceiros_comerciais;
                        const cliente = nomeExibicao(cli?.razao_social, cli?.nome_fantasia, "—");
                        return (
                          <TableRow key={i}>
                            <TableCell className="text-xs py-1.5 font-mono">{r.pedidos?.id_externo ?? "—"}</TableCell>
                            <TableCell className="text-xs py-1.5 max-w-[180px] truncate" title={cliente}>{cliente}</TableCell>
                            <TableCell className="text-xs py-1.5 text-right tabular-nums">{formatNum(r.quantidade)}</TableCell>
                            <TableCell className="text-xs py-1.5">{r.pedidos?.estagio ?? "—"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Secao>

            {/* 8. Como calculamos — memória de cálculo com os números da linha */}
            {row && <ComoCalculamos row={row} />}

            <div className="h-8" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─────────────────────────────────────────────────────────────
// Como calculamos (memória de cálculo do painel)
// ─────────────────────────────────────────────────────────────

function LinhaCalculo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{rotulo}</div>
      <div className="mt-0.5 font-mono text-[11px] leading-relaxed">{children}</div>
    </div>
  );
}

function NaoCalculado({ motivo }: { motivo: string }) {
  return <span className="text-muted-foreground">não calculado — {motivo}</span>;
}

function ComoCalculamos({ row }: { row: CockpitRow }) {
  const temCusto = row.custo != null;
  const temVenda = row.un_vendidas != null && Number(row.un_vendidas) > 0;
  const temEstoque = row.estoque_base != null && Number(row.estoque_base) > 0;
  const temCapital = row.capital_parado != null && Number(row.capital_parado) > 0;
  const temGiro = row.un_por_dia != null && Number(row.un_por_dia) > 0;

  return (
    <Collapsible className="mt-6">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
        <Calculator className="h-3.5 w-3.5" />
        Como calculamos
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-3 space-y-3 rounded-md border bg-muted/30 p-3">
          <LinhaCalculo rotulo="Margem de contribuição por canal">
            {!temVenda ? (
              <NaoCalculado motivo="sem venda no período" />
            ) : (
              <div className="space-y-1">
                {Number(row.un_b2b ?? 0) > 0 && (
                  <div>
                    B2B: preço médio {formatBRL(row.preco_medio_b2b)} × {formatNum(row.un_b2b)} un → margem {formatBRL(row.margem_contribuicao_b2b)}
                  </div>
                )}
                {Number(row.un_b2c ?? 0) > 0 && (
                  <div>
                    B2C: preço médio {formatBRL(row.preco_medio_b2c)} × {formatNum(row.un_b2c)} un → margem {formatBRL(row.margem_contribuicao_b2c)}
                  </div>
                )}
                <div>
                  Total: {formatBRL(row.margem_contribuicao_b2b)} + {formatBRL(row.margem_contribuicao_b2c)} = {formatBRL(row.margem_contribuicao)}
                  {row.margem_contribuicao_pct != null && ` (${formatPct(row.margem_contribuicao_pct)} da receita)`}
                </div>
                <div className="font-sans text-[10px] text-muted-foreground">
                  Cada canal desconta as próprias despesas variáveis (Parâmetros de Precificação).
                </div>
              </div>
            )}
          </LinhaCalculo>
          <LinhaCalculo rotulo="Capital em estoque">
            {!temCusto ? (
              <NaoCalculado motivo="sem custo" />
            ) : !temEstoque ? (
              <NaoCalculado motivo="sem estoque" />
            ) : (
              <>
                {formatNum(row.estoque_base)} un × {formatBRL(row.custo)} = {formatBRL(row.capital_parado)}
              </>
            )}
          </LinhaCalculo>
          <LinhaCalculo rotulo="GMROI">
            {!temVenda ? (
              <NaoCalculado motivo="sem venda no período" />
            ) : !temCapital ? (
              <NaoCalculado motivo="sem capital em estoque" />
            ) : row.gmroi == null ? (
              <NaoCalculado motivo="sem custo" />
            ) : (
              <>
                {formatBRL(row.margem_contribuicao)} × 365 ÷ {formatNum(row.dias_janela)} dias ÷ {formatBRL(row.capital_parado)} = {Number(row.gmroi).toFixed(2)}
              </>
            )}
          </LinhaCalculo>
          <LinhaCalculo rotulo="Cobertura">
            {!temGiro ? (
              <NaoCalculado motivo="sem venda" />
            ) : row.cobertura_dias == null ? (
              <NaoCalculado motivo="sem estoque" />
            ) : (
              <>
                {formatNum(row.estoque_virtual)} un ÷ {formatNum(row.un_por_dia, 2)} un/dia = {formatNum(row.cobertura_dias)} dias
              </>
            )}
          </LinhaCalculo>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

