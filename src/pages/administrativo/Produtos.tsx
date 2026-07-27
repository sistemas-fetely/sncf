import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelectTrigger } from "@/components/ui/filter-select-trigger";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
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
import { SortableTableHead, type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  RefreshCw, Search, AlertTriangle, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format-currency";

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

type CustoStatus = "real" | "interino" | "ausente" | string;

interface CockpitRow {
  sku: string;
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
  status_venda: string | null;
  dias_desde_contagem: number | null;
  cobertura_dias: number | null;
  capital_parado: number | null;
  preco_divergente_bling: boolean | null;
  preco_no_bling: number | null;
}

interface CarteiraResumo {
  skus_ativos: number | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  receita_periodo: number | null;
  receita_cancelada: number | null;
  pct_cancelado: number | null;
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
}

type Col =
  | "sku" | "nome" | "vendido" | "receita" | "custo"
  | "mb2b" | "mb2c" | "virtual" | "cobertura" | "capital";

// ─────────────────────────────────────────────────────────────
// Constantes / helpers
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 60;
const FOOTER_RESERVE = 80;

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

function formatDateBRShort(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

const CURVA_STYLE: Record<string, string> = {
  A: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  B: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  C: "bg-muted text-muted-foreground border-border",
  sem_venda: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
};

// ─────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────

export default function Produtos() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [curvaFiltro, setCurvaFiltro] = useState("todas");
  const [custoFiltro, setCustoFiltro] = useState("todos");
  const [estoqueFiltro, setEstoqueFiltro] = useState("todos");
  const [margemFiltro, setMargemFiltro] = useState("todas");
  const [alertaFiltro, setAlertaFiltro] = useState("todos");
  const [sort, setSort] = useState<SortState<Col> | null>({
    column: "receita", direction: "desc",
  });
  const [pagina, setPagina] = useState(1);
  const [pageSizeOpt, setPageSizeOpt] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [autoPageSize, setAutoPageSize] = useState<number>(20);
  const [skuAberto, setSkuAberto] = useState<string | null>(null);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const pageSize = pageSizeOpt === "auto" ? autoPageSize : pageSizeOpt;

  useLayoutEffect(() => {
    function recompute() {
      const el = tableWrapperRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - FOOTER_RESERVE;
      const rows = Math.max(5, Math.floor((available - 48) / ROW_HEIGHT));
      setAutoPageSize(rows);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  const resumoQuery = useQuery({
    queryKey: ["vw_produto_carteira_resumo"],
    queryFn: async (): Promise<CarteiraResumo | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_produto_carteira_resumo")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CarteiraResumo | null;
    },
  });

  const cockpitQuery = useQuery({
    queryKey: ["vw_produto_cockpit"],
    queryFn: async (): Promise<CockpitRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_produto_cockpit")
        .select("*")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as CockpitRow[];
    },
  });

  const lista = cockpitQuery.data ?? [];

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = lista.filter((p) => {
      if (curvaFiltro !== "todas") {
        if (curvaFiltro === "sem_venda" && p.curva !== "sem_venda") return false;
        if (curvaFiltro !== "sem_venda" && p.curva !== curvaFiltro) return false;
      }
      if (custoFiltro !== "todos" && p.custo_status !== custoFiltro) return false;
      if (estoqueFiltro === "razao" && !p.tem_razao) return false;
      if (estoqueFiltro === "bling" && p.tem_razao) return false;
      if (margemFiltro === "abaixo" && !(p.abaixo_piso_b2b || p.abaixo_piso_b2c)) return false;
      if (alertaFiltro === "divergente" && !p.preco_divergente_bling) return false;
      if (alertaFiltro === "cancelamento" && !(Number(p.un_canceladas ?? 0) > 0)) return false;
      if (!q) return true;
      return (
        p.sku?.toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<CockpitRow, Col>(base, sort, {
      sku: (p) => p.sku,
      nome: (p) => p.nome_comercial ?? "",
      vendido: (p) => Number(p.un_vendidas ?? 0),
      receita: (p) => Number(p.receita ?? 0),
      custo: (p) => (p.custo == null ? Number.NEGATIVE_INFINITY : Number(p.custo)),
      mb2b: (p) => (p.resultado_pct_b2b == null ? Number.NEGATIVE_INFINITY : Number(p.resultado_pct_b2b)),
      mb2c: (p) => (p.resultado_pct_b2c == null ? Number.NEGATIVE_INFINITY : Number(p.resultado_pct_b2c)),
      virtual: (p) => Number(p.estoque_virtual ?? 0),
      cobertura: (p) => (p.cobertura_dias == null ? Number.NEGATIVE_INFINITY : Number(p.cobertura_dias)),
      capital: (p) => (p.capital_parado == null ? Number.NEGATIVE_INFINITY : Number(p.capital_parado)),
    });
  }, [lista, busca, curvaFiltro, custoFiltro, estoqueFiltro, margemFiltro, alertaFiltro, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  function handleAtualizar() {
    cockpitQuery.refetch();
    resumoQuery.refetch();
  }

  const resumo = resumoQuery.data;

  const totalCols = 12;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Administrativo" },
          { label: "Produtos" },
        ]}
        title="Produtos"
        subtitle="Cockpit analítico. Cadastro e preço são do FOP — esta tela lê e analisa, não edita."
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
      <FaixaCarteira resumo={resumo} isLoading={resumoQuery.isLoading} />

      {resumo && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6 text-xs text-muted-foreground">
          {Number(resumo.custo_ausente ?? 0) > 0 && (
            <button
              type="button"
              className="hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => { setCustoFiltro("ausente"); setPagina(1); }}
            >
              {formatNum(resumo.custo_ausente)} SKUs sem custo
            </button>
          )}
          {Number(resumo.abaixo_do_piso ?? 0) > 0 && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => { setMargemFiltro("abaixo"); setPagina(1); }}
              >
                {formatNum(resumo.abaixo_do_piso)} abaixo do piso
              </button>
            </>
          )}
          {Number(resumo.preco_divergente_bling ?? 0) > 0 && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => { setAlertaFiltro("divergente"); setPagina(1); }}
              >
                {formatNum(resumo.preco_divergente_bling)} com preço divergente do Bling
              </button>
            </>
          )}
          {Number(resumo.estoque_saldo_bling ?? 0) > 0 && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="hover:text-foreground underline-offset-2 hover:underline"
                onClick={() => { setEstoqueFiltro("bling"); setPagina(1); }}
              >
                {formatNum(resumo.estoque_saldo_bling)} com estoque não lastreado
              </button>
            </>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por SKU ou nome"
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
        <Select value={custoFiltro} onValueChange={(v) => { setCustoFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={custoFiltro !== "todos"} className="w-[150px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os custos</SelectItem>
            <SelectItem value="real">Custo real</SelectItem>
            <SelectItem value="interino">Custo interino</SelectItem>
            <SelectItem value="ausente">Custo ausente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={estoqueFiltro} onValueChange={(v) => { setEstoqueFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={estoqueFiltro !== "todos"} className="w-[160px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo estoque</SelectItem>
            <SelectItem value="razao">Lastreado (razão)</SelectItem>
            <SelectItem value="bling">Saldo Bling</SelectItem>
          </SelectContent>
        </Select>
        <Select value={margemFiltro} onValueChange={(v) => { setMargemFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={margemFiltro !== "todas"} className="w-[160px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas margens</SelectItem>
            <SelectItem value="abaixo">Abaixo do piso</SelectItem>
          </SelectContent>
        </Select>
        <Select value={alertaFiltro} onValueChange={(v) => { setAlertaFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={alertaFiltro !== "todos"} className="w-[190px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos alertas</SelectItem>
            <SelectItem value="divergente">Preço divergente</SelectItem>
            <SelectItem value="cancelamento">Com cancelamento</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      {/* Tabela */}
      <div ref={tableWrapperRef} className="rounded-md border bg-card">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <SortableTableHead column="sku" sort={sort} onSort={setSort} className="w-[120px]">SKU</SortableTableHead>
                <SortableTableHead column="nome" sort={sort} onSort={setSort}>Produto</SortableTableHead>
                <TableHead className="w-[100px]">Curva</TableHead>
                <SortableTableHead column="vendido" sort={sort} onSort={setSort} align="right" className="w-[100px]">Vendido</SortableTableHead>
                <SortableTableHead column="receita" sort={sort} onSort={setSort} align="right" className="w-[120px]">Receita</SortableTableHead>
                <SortableTableHead column="custo" sort={sort} onSort={setSort} align="right" className="w-[130px]">Custo</SortableTableHead>
                <SortableTableHead column="mb2b" sort={sort} onSort={setSort} align="right" className="w-[100px]">MB B2B</SortableTableHead>
                <SortableTableHead column="mb2c" sort={sort} onSort={setSort} align="right" className="w-[100px]">MB B2C</SortableTableHead>
                <SortableTableHead column="virtual" sort={sort} onSort={setSort} align="right" className="w-[110px]">Virtual</SortableTableHead>
                <SortableTableHead column="cobertura" sort={sort} onSort={setSort} align="right" className="w-[100px]">Cobertura</SortableTableHead>
                <SortableTableHead column="capital" sort={sort} onSort={setSort} align="right" className="w-[110px]">Capital</SortableTableHead>
                <TableHead className="w-[90px]">Alertas</TableHead>
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
                      : cobertura < 30 ? "text-red-600 dark:text-red-400 font-medium"
                        : cobertura < 60 ? "text-amber-600 dark:text-amber-400"
                          : "text-muted-foreground";
                  const curva = (p.curva ?? "") as string;
                  return (
                    <TableRow
                      key={p.sku}
                      className="cursor-pointer"
                      onClick={() => setSkuAberto(p.sku)}
                    >
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>
                        <div className="font-medium leading-tight">{p.nome_comercial ?? "—"}</div>
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
                      <TableCell className="text-right tabular-nums">{formatBRL(p.receita ?? 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.custo == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <span>{formatBRL(p.custo)}</span>
                            {p.custo_status === "interino" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">int.</Badge>
                            )}
                            {p.custo_status === "ausente" && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20">s/ custo</Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right tabular-nums",
                        p.abaixo_piso_b2b && "text-red-600 dark:text-red-400 font-medium",
                      )}>
                        {formatPct(p.resultado_pct_b2b)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right tabular-nums",
                        p.abaixo_piso_b2c && "text-red-600 dark:text-red-400 font-medium",
                      )}>
                        {formatPct(p.resultado_pct_b2c)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <div className="flex items-center justify-end gap-1.5">
                          <span className={cn(virtual < 0 && "text-red-600 dark:text-red-400 font-medium")}>
                            {formatNum(virtual)}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full inline-block",
                                  p.tem_razao ? "bg-emerald-500" : "bg-amber-500",
                                )}
                                aria-hidden
                              />
                            </TooltipTrigger>
                            <TooltipContent className="text-xs">
                              {p.tem_razao ? "Lastreado no razão SNCF" : "Saldo Bling — não lastreado"}
                            </TooltipContent>
                          </Tooltip>
                        </div>
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
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {p.preco_divergente_bling && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                FOP {formatBRL(p.preco_b2c)} · Bling {formatBRL(p.preco_no_bling)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {Number(p.un_canceladas ?? 0) > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {formatNum(p.un_canceladas)} un canceladas · {formatBRL(p.receita_cancelada)}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            {filtrados.length === 0
              ? "Nenhum resultado"
              : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicioRange}</span>–<span className="font-medium text-foreground tabular-nums">{fimRange}</span> de <span className="font-medium text-foreground tabular-nums">{filtrados.length}</span></>}
          </span>
          <span className="hidden sm:inline">·</span>
          <div className="hidden sm:flex items-center gap-1.5">
            <span>Por página:</span>
            <Select
              value={String(pageSizeOpt)}
              onValueChange={(v) => {
                setPageSizeOpt(v === "auto" ? "auto" : (Number(v) as PageSizeOption));
                setPagina(1);
              }}
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
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual <= 1} onClick={() => setPagina(1)} aria-label="Primeira página">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual <= 1} onClick={() => setPagina((p) => Math.max(1, p - 1))} aria-label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {pageRange.map((p, idx) =>
              p === "…" ? (
                <span key={`e-${idx}`} className="px-2 text-muted-foreground select-none">…</span>
              ) : (
                <Button
                  key={p}
                  variant={p === paginaAtual ? "default" : "outline"}
                  size="sm"
                  className={cn("h-8 min-w-8 px-2 tabular-nums", p === paginaAtual && "pointer-events-none")}
                  onClick={() => setPagina(p)}
                  aria-current={p === paginaAtual ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} aria-label="Próxima página">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(totalPaginas)} aria-label="Última página">
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* NÍVEL 3 — Painel do SKU */}
      <PainelSku
        sku={skuAberto}
        rowCache={lista}
        onClose={() => setSkuAberto(null)}
        onInvalidate={() => qc.invalidateQueries({ queryKey: ["vw_produto_cockpit"] })}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Faixa (Nível 1)
// ─────────────────────────────────────────────────────────────

function FaixaBloco({
  label, valor, contexto, valorClass,
}: {
  label: string;
  valor: React.ReactNode;
  contexto: React.ReactNode;
  valorClass?: string;
}) {
  return (
    <div className="rounded-md border bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold tabular-nums mt-1", valorClass)}>{valor}</div>
      <div className="text-xs text-muted-foreground mt-1 leading-tight">{contexto}</div>
    </div>
  );
}

function FaixaCarteira({ resumo, isLoading }: { resumo: CarteiraResumo | null | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-md border bg-card px-4 py-3 h-[92px] animate-pulse" />
        ))}
      </div>
    );
  }
  if (!resumo) return null;
  const capitalTotal = Number(resumo.capital_lastreado ?? 0) + Number(resumo.capital_fragil ?? 0);
  const semVenda = Number(resumo.sem_venda ?? 0);
  const capSemVenda = Number(resumo.capital_sem_venda ?? 0);
  const cancelado = Number(resumo.receita_cancelada ?? 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      <FaixaBloco
        label="Receita do período"
        valor={formatBRL(resumo.receita_periodo ?? 0)}
        contexto={<>{formatDateBRShort(resumo.janela_inicio)} a {formatDateBRShort(resumo.janela_fim)}</>}
      />
      <FaixaBloco
        label="Cancelado"
        valorClass="text-amber-600 dark:text-amber-400"
        valor={formatBRL(cancelado)}
        contexto={<>{formatPct(resumo.pct_cancelado)} do valor pedido</>}
      />
      <FaixaBloco
        label="Concentração"
        valor={<>{formatNum(resumo.curva_a)} <span className="text-base text-muted-foreground">SKUs</span></>}
        contexto={<>fazem 50% da receita · B {formatNum(resumo.curva_b)} · C {formatNum(resumo.curva_c)}</>}
      />
      <FaixaBloco
        label="Sem venda"
        valorClass={semVenda > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        valor={formatNum(semVenda)}
        contexto={<>de {formatNum(resumo.skus_ativos)} ativos</>}
      />
      <FaixaBloco
        label="Capital parado"
        valor={formatBRL(capitalTotal)}
        contexto={
          <div className="space-y-0.5">
            <div className="text-emerald-600 dark:text-emerald-400">{formatBRL(resumo.capital_lastreado)} lastreado</div>
            <div className="text-amber-600 dark:text-amber-400">{formatBRL(resumo.capital_fragil)} frágil</div>
          </div>
        }
      />
      <FaixaBloco
        label="Capital sem giro"
        valorClass={capSemVenda > 0 ? "text-red-600 dark:text-red-400" : undefined}
        valor={formatBRL(capSemVenda)}
        contexto="preso em SKU que nunca vendeu"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Painel do SKU (placeholder — detalhe vem no próximo prompt)
// ─────────────────────────────────────────────────────────────

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
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        {sku && (
          <>
            <SheetHeader>
              <SheetTitle className="font-mono text-sm">{sku}</SheetTitle>
              <SheetDescription>{row?.nome_comercial ?? ""}</SheetDescription>
            </SheetHeader>
            <div className="mt-8 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Painel de detalhe em breve.
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
