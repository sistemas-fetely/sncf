import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { FilterInput } from "@/components/ui/filter-input";
import { FilterSelectTrigger } from "@/components/ui/filter-select-trigger";
import { Select, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTableHead, type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingProgresso {
  skus_ativos: number;
  com_razao: number;
  sem_razao: number;
  pct_onboardado: number;
  skus_com_baixa_perdida: number;
  unidades_nao_lancadas: number;
  seguro_desligar_bling: boolean;
}

interface SaudeSku {
  sku: string;
  nome_comercial: string | null;
  estoque_contabil: number | null;
  estoque_real: number | null;
  tem_razao: boolean;
  saude_divergencia: number | null;
  contagem_em: string | null;
  dias_desde_contagem: number | null;
  movimento_desde_contagem: number | null;
}

interface BaixaPendente {
  sku: string;
  nome_comercial: string | null;
  motivo: string | null;
  notas: number | null;
  unidades_nao_lancadas: number | null;
  primeira_nf: string | null;
  ultima_nf: string | null;
}

interface ShopifyRetido {
  sku: string;
  nome_comercial: string | null;
  shopify_atual: number | null;
  sncf_virtual_estimado: number | null;
  diff_estimado: number | null;
  motivo_retencao: string | null;
}

interface DivergenciaBling {
  codigo: string;
  nome: string | null;
  saldo_bling: number | null;
  divergencia: string | null;
  acao: string | null;
}

type Col =
  | "sku"
  | "nome"
  | "contabil"
  | "real"
  | "saude"
  | "contagem"
  | "idade"
  | "movimento";

const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 53;
const FOOTER_RESERVE = 80;

const MOTIVO_BAIXA: Record<string, string> = {
  sku_sem_razao: "SKU sem razão",
  nf_anterior_a_contagem: "NF anterior à contagem",
};

const DIVERGENCIA_BLING: Record<string, string> = {
  inativo_no_sncf: "Inativo no FOP",
  ausente_no_sncf: "Ausente no FOP",
};

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

function formatData(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export default function SaudeEstoque() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [divFiltro, setDivFiltro] = useState<string>("todas");
  const [sort, setSort] = useState<SortState<Col> | null>({
    column: "saude",
    direction: "desc",
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

  const onboardingQ = useQuery({
    queryKey: ["vw_estoque_onboarding_progresso"],
    queryFn: async (): Promise<OnboardingProgresso | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_onboarding_progresso")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as OnboardingProgresso | null;
    },
  });

  const estoqueQ = useQuery({
    queryKey: ["vw_estoque__saude"],
    queryFn: async (): Promise<SaudeSku[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque")
        .select("sku,nome_comercial,estoque_contabil,estoque_real,tem_razao,saude_divergencia,contagem_em,dias_desde_contagem,movimento_desde_contagem")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as SaudeSku[];
    },
  });

  const baixasQ = useQuery({
    queryKey: ["vw_baixa_estoque_pendente"],
    queryFn: async (): Promise<BaixaPendente[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_baixa_estoque_pendente")
        .select("*")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as BaixaPendente[];
    },
  });

  const retidoQ = useQuery({
    queryKey: ["vw_estoque_shopify_retido"],
    queryFn: async (): Promise<ShopifyRetido[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_shopify_retido")
        .select("*")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ShopifyRetido[];
    },
  });

  const divergQ = useQuery({
    queryKey: ["vw_produto_divergencia_bling"],
    queryFn: async (): Promise<DivergenciaBling[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_produto_divergencia_bling")
        .select("codigo,nome,saldo_bling,divergencia,acao")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as DivergenciaBling[];
    },
  });

  const lista = estoqueQ.data ?? [];
  const listaLastreada = useMemo(() => lista.filter((p) => p.tem_razao), [lista]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = listaLastreada.filter((p) => {
      const d = Number(p.saude_divergencia ?? 0);
      if (divFiltro === "divergentes" && d === 0) return false;
      if (divFiltro === "conferindo" && d !== 0) return false;
      if (!q) return true;
      return (
        p.sku?.toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<SaudeSku, Col>(base, sort, {
      sku: (p) => p.sku,
      nome: (p) => p.nome_comercial ?? "",
      contabil: (p) => (p.estoque_contabil == null ? Number.NEGATIVE_INFINITY : Number(p.estoque_contabil)),
      real: (p) => (p.estoque_real == null ? Number.NEGATIVE_INFINITY : Number(p.estoque_real)),
      saude: (p) => Math.abs(Number(p.saude_divergencia ?? 0)),
      contagem: (p) => p.contagem_em ?? "",
      idade: (p) => (p.dias_desde_contagem == null ? Number.NEGATIVE_INFINITY : Number(p.dias_desde_contagem)),
      movimento: (p) => Number(p.movimento_desde_contagem ?? 0),
    });
  }, [listaLastreada, busca, divFiltro, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  const onboarding = onboardingQ.data;
  const baixas = baixasQ.data ?? [];
  const retidos = retidoQ.data ?? [];
  const divergencias = divergQ.data ?? [];

  function handleAtualizar() {
    qc.invalidateQueries({ queryKey: ["vw_estoque_onboarding_progresso"] });
    qc.invalidateQueries({ queryKey: ["vw_estoque__saude"] });
    qc.invalidateQueries({ queryKey: ["vw_baixa_estoque_pendente"] });
    qc.invalidateQueries({ queryKey: ["vw_estoque_shopify_retido"] });
    qc.invalidateQueries({ queryKey: ["vw_produto_divergencia_bling"] });
  }

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const pct = Number(onboarding?.pct_onboardado ?? 0);
  const seguro = !!onboarding?.seguro_desligar_bling;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
          { label: "Estoque" },
          { label: "Saúde" },
        ]}
        title="Saúde do Estoque"
        subtitle="O razão de estoque é confiável? Painel de auditoria — somente leitura."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleAtualizar}
            disabled={onboardingQ.isFetching || estoqueQ.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", (onboardingQ.isFetching || estoqueQ.isFetching) && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {/* BLOCO 1 — Onboarding */}
      <section className="rounded-lg border bg-card p-5 mb-6">
        <div className="flex items-baseline justify-between gap-4 flex-wrap mb-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Onboarding do razão
            </div>
            <div className="text-sm">
              {onboarding ? (
                <>
                  <span className="text-2xl font-semibold tabular-nums">{formatNum(onboarding.com_razao)}</span>
                  <span className="text-muted-foreground"> de </span>
                  <span className="font-medium tabular-nums">{formatNum(onboarding.skus_ativos)}</span>
                  <span className="text-muted-foreground"> SKUs lastreados no razão </span>
                  <span className="font-medium tabular-nums">({pct.toFixed(1)}%)</span>
                </>
              ) : (
                <span className="text-muted-foreground">Carregando…</span>
              )}
            </div>
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden mb-4">
          <div
            className={cn(
              "h-full transition-all",
              seguro ? "bg-emerald-500" : "bg-amber-500",
            )}
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>

        {onboarding && (
          seguro ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900 dark:text-emerald-100">
                <div className="font-semibold mb-0.5">Seguro desligar o controle de estoque do Bling.</div>
                Todos os SKUs ativos estão lastreados no razão SNCF.
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-900 dark:text-red-100">
                <div className="font-semibold mb-0.5">NÃO desligar o controle de estoque do Bling.</div>
                <span className="tabular-nums">{formatNum(onboarding.sem_razao)}</span> SKUs ainda tiram saldo do Bling — desligar agora congela esses SKUs, porque a baixa por NF só toca SKU com contagem.
              </div>
            </div>
          )
        )}
      </section>

      {/* BLOCO 2 — Cards de pendência */}
      <div className="grid gap-4 md:grid-cols-3 mb-8">
        <PendenciaCard
          label="Baixas não lançadas"
          value={onboarding?.unidades_nao_lancadas ?? 0}
          suffix="un"
          contexto={
            onboarding
              ? `em ${formatNum(onboarding.skus_com_baixa_perdida)} SKUs — saídas de NF que o razão não registrou`
              : "saídas de NF que o razão não registrou"
          }
          tone={Number(onboarding?.unidades_nao_lancadas ?? 0) > 0 ? "amber" : "muted"}
          onClick={() => scrollTo("secao-baixas")}
        />
        <PendenciaCard
          label="Retido do Shopify"
          value={retidos.length}
          contexto="divergências que não vão no push por falta de razão"
          tone={retidos.length > 0 ? "amber" : "muted"}
          onClick={() => scrollTo("secao-retido")}
        />
        <PendenciaCard
          label="Divergência de cadastro"
          value={divergencias.length}
          contexto="ativos no Bling que não são ativos no FOP"
          tone={divergencias.length > 0 ? "amber" : "muted"}
          onClick={() => scrollTo("secao-divergencia")}
        />
      </div>

      {/* BLOCO 3 — Tabela de saúde por SKU */}
      <section className="mb-10">
        <div className="mb-3">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
            Saúde por SKU · somente lastreados
          </h2>
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
          <Select value={divFiltro} onValueChange={(v) => { setDivFiltro(v); setPagina(1); }}>
            <FilterSelectTrigger active={divFiltro !== "todas"} className="w-[220px]">
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as divergências</SelectItem>
              <SelectItem value="divergentes">Só divergentes</SelectItem>
              <SelectItem value="conferindo">Só conferindo</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtrados.length} {filtrados.length === 1 ? "SKU" : "SKUs"}
          </span>
        </div>

        <div ref={tableWrapperRef} className="rounded-md border bg-card">
          <TooltipProvider delayDuration={200}>
            <Table>
              <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
                <TableRow>
                  <SortableTableHead column="sku" sort={sort} onSort={setSort} className="w-[120px]">SKU</SortableTableHead>
                  <SortableTableHead column="nome" sort={sort} onSort={setSort}>Produto</SortableTableHead>
                  <SortableTableHead column="contabil" sort={sort} onSort={setSort} align="right" className="w-[100px]">Contábil</SortableTableHead>
                  <SortableTableHead column="real" sort={sort} onSort={setSort} align="right" className="w-[100px]">Contado</SortableTableHead>
                  <SortableTableHead column="saude" sort={sort} onSort={setSort} align="right" className="w-[120px]">Divergência</SortableTableHead>
                  <SortableTableHead column="contagem" sort={sort} onSort={setSort} className="w-[130px]">Contagem em</SortableTableHead>
                  <SortableTableHead column="idade" sort={sort} onSort={setSort} align="right" className="w-[90px]">Idade</SortableTableHead>
                  <SortableTableHead column="movimento" sort={sort} onSort={setSort} align="right" className="w-[160px]">Movimento desde contagem</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {estoqueQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Carregando…</TableCell>
                  </TableRow>
                ) : pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">Nenhum SKU encontrado.</TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => {
                    const div = p.saude_divergencia;
                    const idade = p.dias_desde_contagem;
                    const mov = Number(p.movimento_desde_contagem ?? 0);
                    const idadeAmber = (idade != null && idade > 30) || mov > 0;
                    return (
                      <TableRow key={p.sku}>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell className="font-medium">{p.nome_comercial ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.estoque_contabil == null ? <span className="text-muted-foreground">—</span> : formatNum(p.estoque_contabil)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.estoque_real == null ? <span className="text-muted-foreground">—</span> : formatNum(p.estoque_real)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {div == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                {div === 0 ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 cursor-help">✓</span>
                                ) : (
                                  <span className="font-medium cursor-help text-red-600 dark:text-red-400">
                                    {formatSigned(div)}
                                  </span>
                                )}
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">
                                {div === 0
                                  ? "Contagem confere com o razão na data em que foi feita."
                                  : `Divergência física real: a recontagem discordou do razão em ${formatNum(Math.abs(div))} unidade(s).`}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {p.contagem_em ? formatData(p.contagem_em) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {idade == null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={cn(
                              "text-xs",
                              idadeAmber ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
                            )}>
                              {idade === 0 ? "hoje" : `${idade}d`}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {mov === 0 ? <span className="text-muted-foreground">0</span> : formatNum(mov)}
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
      </section>

      {/* BLOCO 4 — Detalhes */}
      <section id="secao-baixas" className="mb-10 scroll-mt-6">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Baixas não lançadas
        </h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="w-[180px]">Motivo</TableHead>
                <TableHead className="text-right w-[80px]">NFs</TableHead>
                <TableHead className="text-right w-[130px]">Un. não lançadas</TableHead>
                <TableHead className="w-[110px]">Primeira NF</TableHead>
                <TableHead className="w-[110px]">Última NF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baixasQ.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">Carregando…</TableCell></TableRow>
              ) : baixas.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-xs">Nenhuma baixa pendente. Toda saída de NF encontrou SKU lastreado.</TableCell></TableRow>
              ) : (
                baixas.slice(0, 200).map((b) => (
                  <TableRow key={`${b.sku}-${b.motivo ?? ""}`} className="text-xs">
                    <TableCell className="font-mono py-1.5">{b.sku}</TableCell>
                    <TableCell className="py-1.5">{b.nome_comercial ?? "—"}</TableCell>
                    <TableCell className="py-1.5">{MOTIVO_BAIXA[b.motivo ?? ""] ?? (b.motivo ?? "—")}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatNum(b.notas)}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5 text-amber-600 dark:text-amber-400">{formatNum(b.unidades_nao_lancadas)}</TableCell>
                    <TableCell className="py-1.5">{formatData(b.primeira_nf)}</TableCell>
                    <TableCell className="py-1.5">{formatData(b.ultima_nf)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section id="secao-retido" className="mb-10 scroll-mt-6">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Retido do Shopify
        </h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right w-[110px]">Shopify atual</TableHead>
                <TableHead className="text-right w-[150px]">SNCF virtual (est.)</TableHead>
                <TableHead className="text-right w-[110px]">Diff (est.)</TableHead>
                <TableHead className="w-[180px]">Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {retidoQ.isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Carregando…</TableCell></TableRow>
              ) : retidos.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-xs">Nada retido.</TableCell></TableRow>
              ) : (
                retidos.slice(0, 200).map((r, i) => {
                  const diff = Number(r.diff_estimado ?? 0);
                  return (
                    <TableRow key={`${r.sku}-${i}`} className="text-xs">
                      <TableCell className="font-mono py-1.5">{r.sku}</TableCell>
                      <TableCell className="py-1.5">{r.nome_comercial ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums py-1.5">{formatNum(r.shopify_atual)}</TableCell>
                      <TableCell className="text-right tabular-nums py-1.5">{formatNum(r.sncf_virtual_estimado)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums py-1.5", diff !== 0 && "text-red-600 dark:text-red-400")}>
                        {formatSigned(diff)}
                      </TableCell>
                      <TableCell className="py-1.5">{r.motivo_retencao ?? "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section id="secao-divergencia" className="mb-10 scroll-mt-6">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          Divergência de cadastro
        </h2>
        <div className="rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right w-[120px]">Saldo Bling</TableHead>
                <TableHead className="w-[160px]">Divergência</TableHead>
                <TableHead>Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divergQ.isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Carregando…</TableCell></TableRow>
              ) : divergencias.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-xs">Cadastro do Bling alinhado com o FOP.</TableCell></TableRow>
              ) : (
                divergencias.slice(0, 200).map((d, i) => (
                  <TableRow key={`${d.codigo}-${i}`} className="text-xs">
                    <TableCell className="font-mono py-1.5">{d.codigo}</TableCell>
                    <TableCell className="py-1.5">{d.nome ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums py-1.5">{formatNum(d.saldo_bling)}</TableCell>
                    <TableCell className="py-1.5">{DIVERGENCIA_BLING[d.divergencia ?? ""] ?? (d.divergencia ?? "—")}</TableCell>
                    <TableCell className="py-1.5 text-muted-foreground">{d.acao ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function PendenciaCard({
  label,
  value,
  suffix,
  contexto,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  suffix?: string;
  contexto: string;
  tone: "amber" | "muted";
  onClick: () => void;
}) {
  const formatted = new Intl.NumberFormat("pt-BR").format(value);
  const sizeClass = formatted.length >= 14 ? "text-lg" : formatted.length >= 10 ? "text-xl" : "text-2xl";
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-lg border bg-card p-4 hover:bg-muted/40 transition-colors min-w-0"
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={cn(
        sizeClass,
        "font-semibold tabular-nums leading-none mb-2",
        tone === "amber" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}>
        {formatted}
        {suffix && <span className="text-sm font-normal ml-1">{suffix}</span>}
      </div>
      <div className="text-xs text-muted-foreground">{contexto}</div>
    </button>
  );
}
