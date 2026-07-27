import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { SortableTableHead, type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface EstoqueSku {
  sku: string;
  nome_comercial: string | null;
  ativo: boolean;
  estoque_contabil: number | null;
  estoque_real: number | null;
  tem_razao: boolean;
  estoque_base: number;
  reservado: number;
  estoque_virtual: number;
  estoque_minimo: number;
  saude_divergencia: number | null;
  status_venda: "disponivel" | "baixo" | "indisponivel";
  contagem_em: string | null;
  dias_desde_contagem: number | null;
  movimento_desde_contagem: number | null;
}

type Col =
  | "sku"
  | "nome"
  | "contabil"
  | "real"
  | "idade"
  | "saude"
  | "reservado"
  | "virtual"
  | "status";

const STATUS_LABEL: Record<string, string> = {
  disponivel: "Disponível",
  baixo: "Baixo",
  indisponivel: "Indisponível",
};

const STATUS_CLASS: Record<string, string> = {
  disponivel: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  baixo: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  indisponivel: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 53;
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

function formatNum(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("pt-BR").format(v);
}

function formatSigned(n: number) {
  const abs = new Intl.NumberFormat("pt-BR").format(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
}

function formatHora(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function EstoqueVirtual() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [fonteFiltro, setFonteFiltro] = useState<string>("todas");
  const [sort, setSort] = useState<SortState<Col> | null>({
    column: "virtual",
    direction: "asc",
  });
  const [pagina, setPagina] = useState(1);
  const [pageSizeOpt, setPageSizeOpt] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [autoPageSize, setAutoPageSize] = useState<number>(20);
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

  const produtosQuery = useQuery({
    queryKey: ["vw_estoque"],
    queryFn: async (): Promise<EstoqueSku[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque")
        .select("sku,nome_comercial,ativo,estoque_contabil,estoque_real,tem_razao,estoque_base,reservado,estoque_virtual,estoque_minimo,saude_divergencia,status_venda,contagem_em,dias_desde_contagem,movimento_desde_contagem")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EstoqueSku[];
    },
  });

  const syncQuery = useQuery({
    queryKey: ["sync-cursor-bling-estoque"],
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("integracoes_sync_cursor")
        .select("updated_at")
        .eq("sistema", "bling")
        .in("entidade", ["produtos", "estoques"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data?.updated_at ?? null;
    },
  });

  const lista = produtosQuery.data ?? [];

  const resumo = useMemo(() => {
    let comRazao = 0;
    let semRazao = 0;
    let divergentes = 0;
    let virtualNegativo = 0;
    for (const p of lista) {
      if (p.tem_razao) comRazao++;
      else semRazao++;
      if (p.saude_divergencia != null && p.saude_divergencia !== 0) divergentes++;
      if (Number(p.estoque_virtual ?? 0) < 0) virtualNegativo++;
    }
    return { comRazao, semRazao, divergentes, virtualNegativo };
  }, [lista]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = lista.filter((p) => {
      if (statusFiltro !== "todos" && p.status_venda !== statusFiltro) return false;
      if (fonteFiltro === "razao" && !p.tem_razao) return false;
      if (fonteFiltro === "bling" && p.tem_razao) return false;
      if (!q) return true;
      return (
        p.sku?.toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<EstoqueSku, Col>(base, sort, {
      sku: (p) => p.sku,
      nome: (p) => p.nome_comercial ?? "",
      contabil: (p) => (p.estoque_contabil == null ? Number.NEGATIVE_INFINITY : Number(p.estoque_contabil)),
      real: (p) => (p.estoque_real == null ? Number.NEGATIVE_INFINITY : Number(p.estoque_real)),
      idade: (p) => (p.dias_desde_contagem == null ? Number.NEGATIVE_INFINITY : Number(p.dias_desde_contagem)),
      saude: (p) => (p.saude_divergencia == null ? Number.NEGATIVE_INFINITY : Number(p.saude_divergencia)),
      reservado: (p) => Number(p.reservado ?? 0),
      virtual: (p) => Number(p.estoque_virtual ?? 0),
      status: (p) => p.status_venda,
    });
  }, [lista, busca, statusFiltro, fonteFiltro, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  function handleAtualizar() {
    produtosQuery.refetch();
    syncQuery.refetch();
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Comercial" },
          { label: "Estoque Virtual" },
        ]}
        title="Estoque Virtual"
        subtitle={`Saldo Bling sincronizado em: ${formatHora(syncQuery.data)}`}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleAtualizar}
            disabled={produtosQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", produtosQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm">
        <StatPill
          label="Com razão SNCF"
          value={resumo.comRazao}
          dotClass="bg-emerald-500"
        />
        <StatPill
          label="No saldo Bling"
          value={resumo.semRazao}
          dotClass="bg-amber-500"
        />
        <StatPill
          label="Divergência de saúde"
          value={resumo.divergentes}
          dotClass="bg-red-500"
        />
        <StatPill
          label="Virtual negativo"
          value={resumo.virtualNegativo}
          dotClass="bg-red-500"
        />
      </div>

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
        <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={statusFiltro !== "todos"} className="w-[200px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="disponivel">Disponível</SelectItem>
            <SelectItem value="baixo">Baixo</SelectItem>
            <SelectItem value="indisponivel">Indisponível</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fonteFiltro} onValueChange={(v) => { setFonteFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={fonteFiltro !== "todas"} className="w-[200px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as fontes</SelectItem>
            <SelectItem value="razao">Razão SNCF</SelectItem>
            <SelectItem value="bling">Saldo Bling</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      <div ref={tableWrapperRef} className="rounded-md border bg-card">
        <TooltipProvider delayDuration={200}>
          <Table>
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <SortableTableHead column="sku" sort={sort} onSort={setSort} className="w-[120px]">
                  SKU
                </SortableTableHead>
                <SortableTableHead column="nome" sort={sort} onSort={setSort}>
                  Produto
                </SortableTableHead>
                <TableHead className="w-[130px]">Fonte</TableHead>
                <SortableTableHead column="contabil" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  Contábil
                </SortableTableHead>
                <SortableTableHead column="real" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  Contado
                </SortableTableHead>
                <SortableTableHead column="saude" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  Saúde
                </SortableTableHead>
                <SortableTableHead column="reservado" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  Reservado
                </SortableTableHead>
                <SortableTableHead column="virtual" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  Virtual
                </SortableTableHead>
                <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-[140px]">
                  Status
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((p) => {
                  const virtual = Number(p.estoque_virtual ?? 0);
                  const saude = p.saude_divergencia;
                  return (
                    <TableRow key={p.sku}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.nome_comercial ?? "—"}</TableCell>
                      <TableCell>
                        {p.tem_razao ? (
                          <Badge
                            variant="outline"
                            className="font-normal bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                          >
                            Razão SNCF
                          </Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="font-normal bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 cursor-help"
                              >
                                Saldo Bling
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              SKU ainda não onboardado por contagem XPM — número vem do Bling, não do razão do SNCF.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.estoque_contabil == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatNum(p.estoque_contabil)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.estoque_real == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          formatNum(p.estoque_real)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {saude == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : saude === 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                        ) : (
                          <span className={cn(
                            "font-medium",
                            Math.abs(saude) > 5
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-600 dark:text-amber-400",
                          )}>
                            {formatSigned(saude)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(p.reservado)}</TableCell>
                      <TableCell className={cn(
                        "text-right tabular-nums font-medium",
                        virtual < 0 && "text-red-600 dark:text-red-400",
                      )}>
                        {formatNum(virtual)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-normal", STATUS_CLASS[p.status_venda])}>
                          {STATUS_LABEL[p.status_venda] ?? p.status_venda}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

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
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina(1)}
              aria-label="Primeira página"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              aria-label="Página anterior"
            >
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
                  className={cn(
                    "h-8 min-w-8 px-2 tabular-nums",
                    p === paginaAtual && "pointer-events-none",
                  )}
                  onClick={() => setPagina(p)}
                  aria-current={p === paginaAtual ? "page" : undefined}
                >
                  {p}
                </Button>
              ),
            )}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              aria-label="Próxima página"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={paginaAtual >= totalPaginas}
              onClick={() => setPagina(totalPaginas)}
              aria-label="Última página"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  dotClass,
}: {
  label: string;
  value: number;
  dotClass: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">
        {new Intl.NumberFormat("pt-BR").format(value)}
      </span>
    </div>
  );
}
