import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelectTrigger } from "@/components/ui/filter-select-trigger";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTableHead, type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────
interface ConciliacaoResumo {
  skus_universo: number | null;
  matriz_ativos: number | null;
  presente_nos_tres: number | null;
  nao_encontrado_shopify: number | null;
  espelho_fantasmas: number | null;
  espelho_faltando: number | null;
  catalogo_produtos_reais: number | null;
  catalogo_variantes_reais: number | null;
  ultimo_pull: string | null;
}

interface ConciliacaoSku {
  sku: string;
  nome: string | null;
  linha: string | null;
  na_matriz: boolean | null;
  matriz_ativo: boolean | null;
  no_bling: boolean | null;
  no_shopify: boolean | null;
  ativo_shopify: boolean | null;
  situacao: string | null;
  // Bling comparison
  matriz_ean: string | null;
  bling_gtin: string | null;
  matriz_ncm: string | null;
  bling_ncm: string | null;
  matriz_marca: string | null;
  bling_marca: string | null;
  matriz_preco: number | null;
  bling_preco: number | null;
  dif_ean_bling: boolean | null;
  dif_ncm_bling: boolean | null;
  dif_marca_bling: boolean | null;
  dif_preco_bling: boolean | null;
  ean_ausente_no_bling: boolean | null;
  ncm_ausente_no_bling: boolean | null;
  marca_ausente_no_bling: boolean | null;
  // Shopify
  handle: string | null;
  variantes_shopify: number | null;
  inventory_items: number | null;
  preco_shopify: number | null;
  dif_preco_shopify: boolean | null;
  barcode_shopify: string | null;
}

interface EspelhoSaude {
  shopify_id: string | null;
  handle: string | null;
  titulo: string | null;
  problema: string | null;
  variantes_espelho: number | null;
  variantes_reais: number | null;
}

// ─── Constants ────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 44;
const FOOTER_RESERVE = 80;

const SITUACAO_META: Record<string, { label: string; tone: "emerald" | "amber" | "red" }> = {
  presente_nos_tres: { label: "Presente nos três", tone: "emerald" },
  nao_encontrado_no_shopify: { label: "Não encontrado no Shopify", tone: "amber" },
  nao_encontrado_no_bling: { label: "Não encontrado no Bling", tone: "amber" },
  shopify_sem_matriz: { label: "Shopify sem matriz", tone: "red" },
  bling_sem_matriz: { label: "Bling sem matriz", tone: "red" },
  inativo_na_matriz_ativo_no_destino: { label: "Inativo na matriz, ativo no destino", tone: "amber" },
};

const PROBLEMA_ESPELHO: Record<string, { label: string; tone: "red" | "amber" }> = {
  fantasma_id_igual_handle: { label: "Fantasma: ID igual ao handle", tone: "red" },
  faltando_no_espelho: { label: "Faltando no espelho", tone: "amber" },
  no_espelho_inexistente_no_shopify: { label: "No espelho, inexistente no Shopify", tone: "red" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatNum(n: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(n ?? 0));
}
function formatMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n));
}
function formatPullDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}
function buildPageRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function toneClasses(tone: "emerald" | "amber" | "red" | "muted") {
  switch (tone) {
    case "emerald":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "amber":
      return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "red":
      return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────
type Col1 = "sku" | "nome" | "matriz" | "bling" | "shopify" | "situacao";
type Col2 = "sku" | "nome" | "ean_m" | "ean_b" | "ncm_m" | "ncm_b" | "marca_m" | "marca_b" | "preco_m" | "preco_b";
type Col3 = "sku" | "nome" | "handle" | "variantes" | "invitems" | "preco_m" | "preco_s" | "barcode" | "status";

export default function ConciliacaoCadastro() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<"cobertura" | "bling" | "shopify">("cobertura");

  // Aba 1
  const [busca1, setBusca1] = useState("");
  const [sit1, setSit1] = useState<string>("todas");
  const [sort1, setSort1] = useState<SortState<Col1> | null>({ column: "sku", direction: "asc" });
  const [pagina1, setPagina1] = useState(1);
  const [pageSize1, setPageSize1] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  // Aba 2
  const [filtro2, setFiltro2] = useState<"todos" | "divergencia" | "nao_capturado">("todos");
  const [sort2, setSort2] = useState<SortState<Col2> | null>({ column: "sku", direction: "asc" });
  const [pagina2, setPagina2] = useState(1);
  const [pageSize2, setPageSize2] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  // Aba 3
  const [filtro3, setFiltro3] = useState<"todos" | "multi_inv" | "dif_preco" | "nao_ativo">("todos");
  const [sort3, setSort3] = useState<SortState<Col3> | null>({ column: "sku", direction: "asc" });
  const [pagina3, setPagina3] = useState(1);
  const [pageSize3, setPageSize3] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);

  const wrap1 = useRef<HTMLDivElement | null>(null);
  const wrap2 = useRef<HTMLDivElement | null>(null);
  const wrap3 = useRef<HTMLDivElement | null>(null);
  const [auto1, setAuto1] = useState(20);
  const [auto2, setAuto2] = useState(20);
  const [auto3, setAuto3] = useState(20);

  useLayoutEffect(() => {
    function recompute() {
      const compute = (el: HTMLDivElement | null, set: (n: number) => void) => {
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        const available = window.innerHeight - top - FOOTER_RESERVE;
        const rows = Math.max(5, Math.floor((available - 48) / ROW_HEIGHT));
        set(rows);
      };
      compute(wrap1.current, setAuto1);
      compute(wrap2.current, setAuto2);
      compute(wrap3.current, setAuto3);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [aba]);

  const ps1 = pageSize1 === "auto" ? auto1 : pageSize1;
  const ps2 = pageSize2 === "auto" ? auto2 : pageSize2;
  const ps3 = pageSize3 === "auto" ? auto3 : pageSize3;

  // ─── Queries ────────────────────────────────────────────────────────────
  const resumoQ = useQuery({
    queryKey: ["vw_conciliacao_resumo"],
    queryFn: async (): Promise<ConciliacaoResumo | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_resumo")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as ConciliacaoResumo | null;
    },
  });

  const skuQ = useQuery({
    queryKey: ["vw_conciliacao_sku"],
    queryFn: async (): Promise<ConciliacaoSku[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_conciliacao_sku")
        .select("*")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as ConciliacaoSku[];
    },
  });

  const espelhoQ = useQuery({
    queryKey: ["vw_shopify_espelho_saude"],
    queryFn: async (): Promise<EspelhoSaude[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_shopify_espelho_saude")
        .select("*")
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as EspelhoSaude[];
    },
  });

  function handleAtualizar() {
    qc.invalidateQueries({ queryKey: ["vw_conciliacao_resumo"] });
    qc.invalidateQueries({ queryKey: ["vw_conciliacao_sku"] });
    qc.invalidateQueries({ queryKey: ["vw_shopify_espelho_saude"] });
  }

  const skus = skuQ.data ?? [];
  const resumo = resumoQ.data;

  // ─── Aba 1 filtros ──────────────────────────────────────────────────────
  const lista1 = useMemo(() => {
    const q = busca1.trim().toLowerCase();
    const base = skus.filter((s) => {
      if (sit1 !== "todas" && s.situacao !== sit1) return false;
      if (!q) return true;
      return (
        (s.sku ?? "").toLowerCase().includes(q) ||
        (s.nome ?? "").toLowerCase().includes(q)
      );
    });
    return ordenarPor<ConciliacaoSku, Col1>(base, sort1, {
      sku: (p) => p.sku ?? "",
      nome: (p) => p.nome ?? "",
      matriz: (p) => (p.matriz_ativo ? 2 : p.na_matriz ? 1 : 0),
      bling: (p) => (p.no_bling ? 1 : 0),
      shopify: (p) => (p.ativo_shopify ? 2 : p.no_shopify ? 1 : 0),
      situacao: (p) => p.situacao ?? "",
    });
  }, [skus, busca1, sit1, sort1]);

  // ─── Aba 2 (Bling) ──────────────────────────────────────────────────────
  const lista2 = useMemo(() => {
    const base = skus.filter((s) => {
      if (!s.no_bling) return false;
      if (filtro2 === "divergencia") {
        return !!(s.dif_ean_bling || s.dif_ncm_bling || s.dif_marca_bling || s.dif_preco_bling);
      }
      if (filtro2 === "nao_capturado") {
        return !!(s.ean_ausente_no_bling || s.ncm_ausente_no_bling || s.marca_ausente_no_bling);
      }
      return true;
    });
    return ordenarPor<ConciliacaoSku, Col2>(base, sort2, {
      sku: (p) => p.sku ?? "",
      nome: (p) => p.nome ?? "",
      ean_m: (p) => p.matriz_ean ?? "",
      ean_b: (p) => p.bling_gtin ?? "",
      ncm_m: (p) => p.matriz_ncm ?? "",
      ncm_b: (p) => p.bling_ncm ?? "",
      marca_m: (p) => p.matriz_marca ?? "",
      marca_b: (p) => p.bling_marca ?? "",
      preco_m: (p) => Number(p.matriz_preco ?? -Infinity),
      preco_b: (p) => Number(p.bling_preco ?? -Infinity),
    });
  }, [skus, filtro2, sort2]);

  // ─── Aba 3 (Shopify) ────────────────────────────────────────────────────
  const lista3 = useMemo(() => {
    const base = skus.filter((s) => {
      if (!s.no_shopify) return false;
      if (filtro3 === "multi_inv") return Number(s.inventory_items ?? 0) > 1;
      if (filtro3 === "dif_preco") return !!s.dif_preco_shopify;
      if (filtro3 === "nao_ativo") return !s.ativo_shopify;
      return true;
    });
    return ordenarPor<ConciliacaoSku, Col3>(base, sort3, {
      sku: (p) => p.sku ?? "",
      nome: (p) => p.nome ?? "",
      handle: (p) => p.handle ?? "",
      variantes: (p) => Number(p.variantes_shopify ?? 0),
      invitems: (p) => Number(p.inventory_items ?? 0),
      preco_m: (p) => Number(p.matriz_preco ?? -Infinity),
      preco_s: (p) => Number(p.preco_shopify ?? -Infinity),
      barcode: (p) => p.barcode_shopify ?? "",
      status: (p) => (p.ativo_shopify ? 1 : 0),
    });
  }, [skus, filtro3, sort3]);

  const espelho = useMemo(
    () => (espelhoQ.data ?? []).filter((e) => (e.problema ?? "ok") !== "ok").slice(0, 200),
    [espelhoQ.data],
  );

  // ─── Paginação ──────────────────────────────────────────────────────────
  const total1 = Math.max(1, Math.ceil(lista1.length / ps1));
  const p1 = Math.min(pagina1, total1);
  const pg1 = lista1.slice((p1 - 1) * ps1, p1 * ps1);

  const total2 = Math.max(1, Math.ceil(lista2.length / ps2));
  const p2 = Math.min(pagina2, total2);
  const pg2 = lista2.slice((p2 - 1) * ps2, p2 * ps2);

  const total3 = Math.max(1, Math.ceil(lista3.length / ps3));
  const p3 = Math.min(pagina3, total3);
  const pg3 = lista3.slice((p3 - 1) * ps3, p3 * ps3);

  const anyLoading = resumoQ.isFetching || skuQ.isFetching || espelhoQ.isFetching;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Produto" },
          { label: "Estoque" },
          { label: "Conciliação" },
        ]}
        title="Conciliação de Cadastro"
        subtitle="Matriz FOP × Bling × Shopify. A matriz é a verdade — correções se fazem na origem."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleAtualizar}
            disabled={anyLoading}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", anyLoading && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {/* Faixa de resumo */}
      <div className="grid gap-3 md:grid-cols-5 mb-4">
        <ResumoCard
          label="Universo"
          value={formatNum(resumo?.skus_universo)}
          suffix="SKUs"
          contexto={`${formatNum(resumo?.matriz_ativos)} ativos na matriz`}
        />
        <ResumoCard
          label="Presente nos três"
          value={formatNum(resumo?.presente_nos_tres)}
          tone="emerald"
          contexto="matriz · Bling · Shopify"
        />
        <ResumoCard
          label="Não encontrado no Shopify"
          value={formatNum(resumo?.nao_encontrado_shopify)}
          tone="amber"
          contexto="por SKU — ver aviso"
        />
        <ResumoCard
          label="Espelho Shopify"
          value={formatNum(resumo?.espelho_fantasmas)}
          suffix="fantasmas"
          tone="red"
          contexto={`+ ${formatNum(resumo?.espelho_faltando)} produtos faltando`}
        />
        <ResumoCard
          label="Catálogo real"
          value={formatNum(resumo?.catalogo_produtos_reais)}
          suffix="produtos"
          contexto={`${formatNum(resumo?.catalogo_variantes_reais)} variantes · pull ${formatPullDate(resumo?.ultimo_pull)}`}
        />
      </div>

      {/* Aviso obrigatório */}
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 mb-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900 dark:text-amber-100">
          <strong>Nomenclatura divergente na linha Vela Numérica.</strong>{" "}
          O Shopify usa SKUs como <code className="font-mono text-xs">VNANM.GL.5.0</code> e a matriz usa{" "}
          <code className="font-mono text-xs">VELNUMGRD.CL.7/01760</code> — são os mesmos produtos com códigos
          diferentes. Cerca de 132 SKUs aparecem como <em>não encontrados no Shopify</em> sem estarem ausentes
          de fato. Conciliação por SKU não é conclusiva para essa linha.
        </div>
      </div>

      {/* Abas */}
      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
        <TabsList>
          <TabsTrigger value="cobertura">Cobertura</TabsTrigger>
          <TabsTrigger value="bling">Bling</TabsTrigger>
          <TabsTrigger value="shopify">Shopify</TabsTrigger>
        </TabsList>

        {/* Aba 1 — Cobertura */}
        <TabsContent value="cobertura" className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[260px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <FilterInput
                value={busca1}
                onChange={(e) => { setBusca1(e.target.value); setPagina1(1); }}
                placeholder="Buscar por SKU ou nome"
                className="pl-9"
              />
            </div>
            <Select value={sit1} onValueChange={(v) => { setSit1(v); setPagina1(1); }}>
              <FilterSelectTrigger active={sit1 !== "todas"} className="w-[280px]">
                <SelectValue />
              </FilterSelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as situações</SelectItem>
                {Object.entries(SITUACAO_META).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {lista1.length} {lista1.length === 1 ? "SKU" : "SKUs"}
            </span>
          </div>

          <div ref={wrap1} className="rounded-md border bg-card">
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <SortableTableHead column="sku" sort={sort1} onSort={setSort1} className="w-[160px]">SKU</SortableTableHead>
                    <SortableTableHead column="nome" sort={sort1} onSort={setSort1}>Produto</SortableTableHead>
                    <SortableTableHead column="matriz" sort={sort1} onSort={setSort1} className="w-[110px]">Matriz</SortableTableHead>
                    <SortableTableHead column="bling" sort={sort1} onSort={setSort1} className="w-[100px]">Bling</SortableTableHead>
                    <SortableTableHead column="shopify" sort={sort1} onSort={setSort1} className="w-[110px]">Shopify</SortableTableHead>
                    <SortableTableHead column="situacao" sort={sort1} onSort={setSort1} className="w-[240px]">Situação</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuQ.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : pg1.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Nenhum SKU.</TableCell></TableRow>
                  ) : (
                    pg1.map((s) => {
                      const sit = SITUACAO_META[s.situacao ?? ""] ?? null;
                      const shopifyBadge = s.no_shopify
                        ? s.ativo_shopify
                          ? <BadgeTone tone="emerald">Sim</BadgeTone>
                          : <BadgeTone tone="amber">Não ativo</BadgeTone>
                        : <BadgeTone tone="muted">Não</BadgeTone>;
                      const matrizBadge = s.matriz_ativo
                        ? <BadgeTone tone="emerald">Ativo</BadgeTone>
                        : s.na_matriz
                          ? <BadgeTone tone="muted">Inativo</BadgeTone>
                          : <BadgeTone tone="red">Ausente</BadgeTone>;
                      return (
                        <TableRow key={s.sku}>
                          <TableCell className="font-mono text-xs">{s.sku}</TableCell>
                          <TableCell>
                            <div className="font-medium">{s.nome ?? "—"}</div>
                            {s.linha && <div className="text-xs text-muted-foreground">{s.linha}</div>}
                          </TableCell>
                          <TableCell>{matrizBadge}</TableCell>
                          <TableCell>
                            {s.no_bling
                              ? <BadgeTone tone="emerald">Sim</BadgeTone>
                              : <BadgeTone tone="muted">Não</BadgeTone>}
                          </TableCell>
                          <TableCell>{shopifyBadge}</TableCell>
                          <TableCell>
                            {sit ? <BadgeTone tone={sit.tone}>{sit.label}</BadgeTone> : <span className="text-muted-foreground text-xs">—</span>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>

          <Paginacao
            total={lista1.length}
            pagina={p1}
            totalPaginas={total1}
            pageSizeOpt={pageSize1}
            autoPageSize={auto1}
            onSetPagina={setPagina1}
            onSetPageSize={(v) => { setPageSize1(v); setPagina1(1); }}
          />
        </TabsContent>

        {/* Aba 2 — Bling */}
        <TabsContent value="bling" className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={filtro2} onValueChange={(v) => { setFiltro2(v as typeof filtro2); setPagina2(1); }}>
              <FilterSelectTrigger active={filtro2 !== "todos"} className="w-[240px]">
                <SelectValue />
              </FilterSelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="divergencia">Só divergência real</SelectItem>
                <SelectItem value="nao_capturado">Só não capturado</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {lista2.length} {lista2.length === 1 ? "SKU" : "SKUs"}
            </span>
          </div>

          <div ref={wrap2} className="rounded-md border bg-card overflow-x-auto">
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <SortableTableHead column="sku" sort={sort2} onSort={setSort2} className="w-[140px]">SKU</SortableTableHead>
                    <SortableTableHead column="nome" sort={sort2} onSort={setSort2}>Produto</SortableTableHead>
                    <SortableTableHead column="ean_m" sort={sort2} onSort={setSort2}>EAN (matriz)</SortableTableHead>
                    <SortableTableHead column="ean_b" sort={sort2} onSort={setSort2}>GTIN (Bling)</SortableTableHead>
                    <SortableTableHead column="ncm_m" sort={sort2} onSort={setSort2}>NCM (matriz)</SortableTableHead>
                    <SortableTableHead column="ncm_b" sort={sort2} onSort={setSort2}>NCM (Bling)</SortableTableHead>
                    <SortableTableHead column="marca_m" sort={sort2} onSort={setSort2}>Marca (matriz)</SortableTableHead>
                    <SortableTableHead column="marca_b" sort={sort2} onSort={setSort2}>Marca (Bling)</SortableTableHead>
                    <SortableTableHead column="preco_m" sort={sort2} onSort={setSort2} align="right">Preço (matriz)</SortableTableHead>
                    <SortableTableHead column="preco_b" sort={sort2} onSort={setSort2} align="right">Preço (Bling)</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuQ.isLoading ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : pg2.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Nada a exibir.</TableCell></TableRow>
                  ) : (
                    pg2.map((s) => (
                      <TableRow key={s.sku} className="text-xs">
                        <TableCell className="font-mono">{s.sku}</TableCell>
                        <TableCell className="font-medium">{s.nome ?? "—"}</TableCell>
                        <TableCell>{s.matriz_ean ?? "—"}</TableCell>
                        <TableCell><CampoBling matriz={s.matriz_ean} bling={s.bling_gtin} dif={s.dif_ean_bling} ausente={s.ean_ausente_no_bling} /></TableCell>
                        <TableCell>{s.matriz_ncm ?? "—"}</TableCell>
                        <TableCell><CampoBling matriz={s.matriz_ncm} bling={s.bling_ncm} dif={s.dif_ncm_bling} ausente={s.ncm_ausente_no_bling} /></TableCell>
                        <TableCell>{s.matriz_marca ?? "—"}</TableCell>
                        <TableCell><CampoBling matriz={s.matriz_marca} bling={s.bling_marca} dif={s.dif_marca_bling} ausente={s.marca_ausente_no_bling} /></TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(s.matriz_preco)}</TableCell>
                        <TableCell className={cn("text-right tabular-nums", s.dif_preco_bling && "text-red-600 dark:text-red-400 font-medium")}>
                          {formatMoney(s.bling_preco)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>

          <Paginacao
            total={lista2.length}
            pagina={p2}
            totalPaginas={total2}
            pageSizeOpt={pageSize2}
            autoPageSize={auto2}
            onSetPagina={setPagina2}
            onSetPageSize={(v) => { setPageSize2(v); setPagina2(1); }}
          />
        </TabsContent>

        {/* Aba 3 — Shopify */}
        <TabsContent value="shopify" className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={filtro3} onValueChange={(v) => { setFiltro3(v as typeof filtro3); setPagina3(1); }}>
              <FilterSelectTrigger active={filtro3 !== "todos"} className="w-[260px]">
                <SelectValue />
              </FilterSelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="multi_inv">Multi inventory item</SelectItem>
                <SelectItem value="dif_preco">Divergência de preço</SelectItem>
                <SelectItem value="nao_ativo">Não ativo no Shopify</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {lista3.length} {lista3.length === 1 ? "SKU" : "SKUs"}
            </span>
          </div>

          <div ref={wrap3} className="rounded-md border bg-card overflow-x-auto">
            <TooltipProvider delayDuration={200}>
              <Table>
                <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                  <TableRow>
                    <SortableTableHead column="sku" sort={sort3} onSort={setSort3} className="w-[140px]">SKU</SortableTableHead>
                    <SortableTableHead column="nome" sort={sort3} onSort={setSort3}>Produto</SortableTableHead>
                    <SortableTableHead column="handle" sort={sort3} onSort={setSort3}>Handle</SortableTableHead>
                    <SortableTableHead column="variantes" sort={sort3} onSort={setSort3} align="right" className="w-[100px]">Variantes</SortableTableHead>
                    <SortableTableHead column="invitems" sort={sort3} onSort={setSort3} align="right" className="w-[130px]">Inventory items</SortableTableHead>
                    <SortableTableHead column="preco_m" sort={sort3} onSort={setSort3} align="right" className="w-[120px]">Preço matriz</SortableTableHead>
                    <SortableTableHead column="preco_s" sort={sort3} onSort={setSort3} align="right" className="w-[130px]">Preço Shopify</SortableTableHead>
                    <SortableTableHead column="barcode" sort={sort3} onSort={setSort3}>Barcode Shopify</SortableTableHead>
                    <SortableTableHead column="status" sort={sort3} onSort={setSort3} className="w-[100px]">Status</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {skuQ.isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Carregando…</TableCell></TableRow>
                  ) : pg3.length === 0 ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Nada a exibir.</TableCell></TableRow>
                  ) : (
                    pg3.map((s) => {
                      const inv = Number(s.inventory_items ?? 0);
                      const multi = inv > 1;
                      return (
                        <TableRow key={s.sku} className="text-xs">
                          <TableCell className="font-mono">{s.sku}</TableCell>
                          <TableCell className="font-medium">{s.nome ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.handle ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNum(s.variantes_shopify)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", multi && "text-amber-600 dark:text-amber-400 font-medium")}>
                            {multi ? (
                              <Tooltip>
                                <TooltipTrigger asChild><span className="cursor-help">{formatNum(inv)}</span></TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  SKU em mais de um inventory item — risco de push de estoque duplicado quando este SKU for onboardado.
                                </TooltipContent>
                              </Tooltip>
                            ) : formatNum(inv)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(s.matriz_preco)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", s.dif_preco_shopify && "text-red-600 dark:text-red-400 font-medium")}>
                            {formatMoney(s.preco_shopify)}
                          </TableCell>
                          <TableCell className="font-mono">{s.barcode_shopify ?? "—"}</TableCell>
                          <TableCell>
                            {s.ativo_shopify
                              ? <BadgeTone tone="emerald">Ativo</BadgeTone>
                              : <BadgeTone tone="muted">Inativo</BadgeTone>}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TooltipProvider>
          </div>

          <Paginacao
            total={lista3.length}
            pagina={p3}
            totalPaginas={total3}
            pageSizeOpt={pageSize3}
            autoPageSize={auto3}
            onSetPagina={setPagina3}
            onSetPageSize={(v) => { setPageSize3(v); setPagina3(1); }}
          />

          {/* Saúde do espelho */}
          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
              Saúde do espelho
            </h2>
            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Shopify ID</TableHead>
                    <TableHead className="w-[200px]">Handle</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="w-[280px]">Problema</TableHead>
                    <TableHead className="text-right w-[130px]">Variantes espelho</TableHead>
                    <TableHead className="text-right w-[120px]">Variantes reais</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {espelhoQ.isLoading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Carregando…</TableCell></TableRow>
                  ) : espelho.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Espelho saudável.</TableCell></TableRow>
                  ) : (
                    espelho.map((e, i) => {
                      const meta = PROBLEMA_ESPELHO[e.problema ?? ""] ?? null;
                      return (
                        <TableRow key={`${e.shopify_id ?? "x"}-${i}`} className="text-xs">
                          <TableCell className="font-mono text-xs py-1.5">{e.shopify_id ?? "—"}</TableCell>
                          <TableCell className="font-mono text-xs py-1.5 text-muted-foreground">{e.handle ?? "—"}</TableCell>
                          <TableCell className="py-1.5">{e.titulo ?? "—"}</TableCell>
                          <TableCell className="py-1.5">
                            {meta ? <BadgeTone tone={meta.tone}>{meta.label}</BadgeTone> : <span className="text-muted-foreground">{e.problema}</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums py-1.5">{formatNum(e.variantes_espelho)}</TableCell>
                          <TableCell className="text-right tabular-nums py-1.5">{formatNum(e.variantes_reais)}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────
function ResumoCard({
  label, value, suffix, contexto, tone,
}: {
  label: string;
  value: string;
  suffix?: string;
  contexto: string;
  tone?: "emerald" | "amber" | "red";
}) {
  const len = String(value ?? "").length;
  const sizeClass = len >= 14 ? "text-lg" : len >= 10 ? "text-xl" : "text-2xl";
  return (
    <div className="rounded-lg border bg-card p-4 min-w-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={cn(
        sizeClass,
        "font-semibold tabular-nums leading-none mb-2",
        tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
        tone === "amber" && "text-amber-600 dark:text-amber-400",
        tone === "red" && "text-red-600 dark:text-red-400",
      )}>
        {value}
        {suffix && <span className="text-sm font-normal ml-1 text-muted-foreground">{suffix}</span>}
      </div>
      <div className="text-xs text-muted-foreground">{contexto}</div>
    </div>
  );
}

function BadgeTone({ tone, children }: { tone: "emerald" | "amber" | "red" | "muted"; children: React.ReactNode }) {
  return (
    <Badge variant="outline" className={cn("font-normal", toneClasses(tone))}>
      {children}
    </Badge>
  );
}

function CampoBling({
  matriz, bling, dif, ausente,
}: {
  matriz: string | null;
  bling: string | null;
  dif: boolean | null;
  ausente: boolean | null;
}) {
  if (ausente) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="italic text-muted-foreground cursor-help">não capturado</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          O espelho Bling não captura este campo — 0 de 901 registros têm valor. Não é divergência, é ausência de captura na sincronização.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (dif) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-red-600 dark:text-red-400 font-medium cursor-help">{bling ?? "—"}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          Divergência real: os dois lados têm valor e são diferentes.
        </TooltipContent>
      </Tooltip>
    );
  }
  return <span>{bling ?? (matriz ? matriz : "—")}</span>;
}

function Paginacao({
  total, pagina, totalPaginas, pageSizeOpt, autoPageSize, onSetPagina, onSetPageSize,
}: {
  total: number;
  pagina: number;
  totalPaginas: number;
  pageSizeOpt: PageSizeOption;
  autoPageSize: number;
  onSetPagina: (n: number) => void;
  onSetPageSize: (v: PageSizeOption) => void;
}) {
  const ps = pageSizeOpt === "auto" ? autoPageSize : pageSizeOpt;
  const inicio = total === 0 ? 0 : (pagina - 1) * ps + 1;
  const fim = Math.min(pagina * ps, total);
  const range = buildPageRange(pagina, totalPaginas);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>
          {total === 0
            ? "Nenhum resultado"
            : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicio}</span>–<span className="font-medium text-foreground tabular-nums">{fim}</span> de <span className="font-medium text-foreground tabular-nums">{total}</span></>}
        </span>
        <span className="hidden sm:inline">·</span>
        <div className="hidden sm:flex items-center gap-1.5">
          <span>Por página:</span>
          <Select
            value={String(pageSizeOpt)}
            onValueChange={(v) => onSetPageSize(v === "auto" ? "auto" : (Number(v) as PageSizeOption))}
          >
            <FilterSelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n === "auto" ? `Auto (${autoPageSize})` : n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina <= 1} onClick={() => onSetPagina(1)} aria-label="Primeira página">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina <= 1} onClick={() => onSetPagina(Math.max(1, pagina - 1))} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {range.map((p, idx) =>
            p === "…" ? (
              <span key={`e-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
            ) : (
              <Button
                key={p}
                variant={p === pagina ? "default" : "outline"}
                size="sm"
                className={cn("h-8 min-w-8 px-2 tabular-nums", p === pagina && "pointer-events-none")}
                onClick={() => onSetPagina(p)}
                aria-current={p === pagina ? "page" : undefined}
              >
                {p}
              </Button>
            ),
          )}
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina >= totalPaginas} onClick={() => onSetPagina(Math.min(totalPaginas, pagina + 1))} aria-label="Próxima página">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={pagina >= totalPaginas} onClick={() => onSetPagina(totalPaginas)} aria-label="Última página">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
