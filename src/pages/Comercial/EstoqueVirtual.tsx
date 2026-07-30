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
import {
  AlertTriangle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classeStatusVenda, rotuloStatusVenda, STATUS_VENDA_ORDEM,
} from "@/lib/estoque/status-venda";
import { DetalheEstoqueSkuSheet } from "@/components/estoque/DetalheEstoqueSkuSheet";

interface EstoqueRede {
  sku: string;
  nome_comercial: string | null;
  ativo: boolean;
  fiscal_vendavel: number | null;
  bloqueado: number | null;
  fisico: number | null;
  furo: number | null;
  reservado: number | null;
  reservado_aguardando_produto: number | null;
  disponivel: number | null;
  descoberto: number | null;
  em_showroom: number | null;
  nao_contabil: number | null;
  tem_razao: boolean;
  estoque_minimo: number | null;
  referencia_bling: number | null;
  delta_bling: number | null;
  status_venda: string;
  contagem_em: string | null;
  dias_desde_contagem: number | null;
  pedido_suprimento: string | null;
  origem_suprimento: string | null;
  eta_prevista: string | null;
  eta_precisao: string | null;
  status_suprimento: string | null;
}

const COLS =
  "sku,nome_comercial,ativo,fiscal_vendavel,bloqueado,fisico,furo,reservado,reservado_aguardando_produto,disponivel,descoberto,em_showroom,nao_contabil,tem_razao,estoque_minimo,referencia_bling,delta_bling,status_venda,contagem_em,dias_desde_contagem,pedido_suprimento,origem_suprimento,eta_prevista,eta_precisao,status_suprimento";

type Col =
  | "sku"
  | "nome"
  | "vendavel"
  | "bloqueado"
  | "reservado"
  | "aguardando"
  | "disponivel"
  | "descoberto"
  | "showroom"
  | "chegada"
  | "bling"
  | "status";

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
  return new Intl.NumberFormat("pt-BR").format(Number(n ?? 0));
}

function formatDelta(n: number | null | undefined) {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat("pt-BR").format(Math.abs(v));
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${s}`;
}

function adaptiveValueClass(text: string): string {
  const len = text.length;
  if (len <= 9) return "text-2xl";
  if (len <= 13) return "text-xl";
  return "text-lg";
}

const MESES = [

  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function rotuloOrigem(origem: string | null | undefined) {
  if (origem === "nacional") return "Nacional";
  if (origem === "importacao") return "Importação";
  return "Suprimento";
}

function temPrevisao(iso: string | null | undefined, precisao: string | null | undefined) {
  return !!iso && precisao !== "sem_previsao";
}

/** Renderiza a ETA com a precisão que ela realmente tem — nunca mais precisa que isso. */
function formatEta(
  iso: string | null | undefined,
  precisao: string | null | undefined,
  statusSuprimento: string | null | undefined,
) {
  if (!temPrevisao(iso, precisao)) {
    return `${statusSuprimento ?? "Situação não informada"} · sem previsão de data`;
  }
  const d = new Date(iso!.length === 10 ? `${iso}T00:00:00` : iso!);
  if (isNaN(d.getTime())) {
    return `${statusSuprimento ?? "Situação não informada"} · sem previsão de data`;
  }
  if (precisao === "mes") return `Previsão ${MESES[d.getMonth()]}/${d.getFullYear()}`;
  if (precisao === "trimestre") {
    return `Previsão ${Math.floor(d.getMonth() / 3) + 1}º trimestre/${d.getFullYear()}`;
  }
  return `Previsão ${d.toLocaleDateString("pt-BR")}`;
}


export default function EstoqueVirtual() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [condicaoFiltro, setCondicaoFiltro] = useState<string>("todos");
  const [detalhe, setDetalhe] = useState<{ sku: string; nome: string | null } | null>(null);
  const [sort, setSort] = useState<SortState<Col> | null>({
    column: "descoberto",
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

  const produtosQuery = useQuery({
    queryKey: ["vw_estoque_rede"],
    queryFn: async (): Promise<EstoqueRede[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_rede")
        .select(COLS)
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as EstoqueRede[];
    },
  });

  const lista = produtosQuery.data ?? [];

  const resumo = useMemo(() => {
    let semLastroSkus = 0;
    let semLastroUn = 0;
    let preVenda = 0;
    let unAguardando = 0;
    let aChegar = 0;
    let semPrevisao = 0;
    let indisponivel = 0;
    let bloqueadoUn = 0;
    let bloqueadoSkus = 0;
    let showroomUn = 0;
    let descobertoUn = 0;
    let descobertoSkus = 0;
    for (const p of lista) {
      if (p.status_venda === "vendido_sem_lastro") {
        semLastroSkus++;
        semLastroUn += Number(p.reservado ?? 0);
      }
      if (p.status_venda === "pre_venda") {
        preVenda++;
        unAguardando += Number(p.reservado_aguardando_produto ?? 0);
      }
      if (p.status_venda === "a_chegar") aChegar++;
      if (p.status_venda === "sem_previsao") semPrevisao++;
      if (p.status_venda === "indisponivel") indisponivel++;
      const bloq = Number(p.bloqueado ?? 0);
      if (bloq > 0) {
        bloqueadoUn += bloq;
        bloqueadoSkus++;
      }
      showroomUn += Number(p.em_showroom ?? 0);
      const desc = Number(p.descoberto ?? 0);
      if (desc > 0) {
        descobertoUn += desc;
        descobertoSkus++;
      }
    }
    return {
      semLastroSkus, semLastroUn, preVenda, unAguardando, aChegar,
      semPrevisao, indisponivel, bloqueadoUn, bloqueadoSkus, showroomUn,
      descobertoUn, descobertoSkus,
    };

  }, [lista]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = lista.filter((p) => {
      if (statusFiltro !== "todos" && p.status_venda !== statusFiltro) return false;
      const bloq = Number(p.bloqueado ?? 0);
      if (condicaoFiltro === "com_bloqueio" && !(bloq > 0)) return false;
      if (condicaoFiltro === "com_showroom" && !(Number(p.em_showroom ?? 0) > 0)) return false;
      if (condicaoFiltro === "com_delta_bling" && Number(p.delta_bling ?? 0) === 0) return false;
      if (!q) return true;
      return (
        p.sku?.toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<EstoqueRede, Col>(base, sort, {
      sku: (p) => p.sku,
      nome: (p) => p.nome_comercial ?? "",
      vendavel: (p) => Number(p.fiscal_vendavel ?? 0),
      bloqueado: (p) => Number(p.bloqueado ?? 0),
      reservado: (p) => Number(p.reservado ?? 0),
      aguardando: (p) => Number(p.reservado_aguardando_produto ?? 0),
      disponivel: (p) => Number(p.disponivel ?? 0),
      descoberto: (p) => Number(p.descoberto ?? 0),
      showroom: (p) => Number(p.em_showroom ?? 0),
      chegada: (p) => p.eta_prevista ?? "",
      bling: (p) => Number(p.delta_bling ?? 0),

      status: (p) => STATUS_VENDA_ORDEM.indexOf(p.status_venda as never),
    });
  }, [lista, busca, statusFiltro, condicaoFiltro, sort]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  return (
    <div className="max-w-[1500px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
          { label: "Estoque" },
          { label: "Geral" },
        ]}
        title="Estoque Geral"
        subtitle="Rede consolidada pelo razão do SNCF (SKU × centro × condição). O Bling é apenas referência."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => produtosQuery.refetch()}
            disabled={produtosQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", produtosQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {resumo.semLastroSkus > 0 && (
        <button
          type="button"
          onClick={() => { setStatusFiltro("vendido_sem_lastro"); setPagina(1); }}
          className="w-full text-left mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 flex items-start gap-3 hover:bg-destructive/15 transition-colors"
        >
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-destructive">
              {formatNum(resumo.semLastroSkus)} SKUs vendidos sem lastro
            </div>
            <div className="text-xs text-destructive/90">
              {formatNum(resumo.semLastroUn)} unidades comprometidas com clientes e nenhum pedido de suprimento — nacional ou importado — para cobrir. Clique para filtrar.
            </div>
          </div>
        </button>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 text-sm">
        <StatPill
          label="Vendido sem lastro"
          value={formatNum(resumo.semLastroSkus)}
          dotClass="bg-destructive"
          valueClassName="text-destructive"
          sublabel={`${formatNum(resumo.semLastroUn)} un prometidas`}
        />
        <StatPill
          label="Descoberto"
          value={`${formatNum(resumo.descobertoUn)} un`}
          dotClass="bg-destructive"
          valueClassName="text-destructive"
          sublabel={`${formatNum(resumo.descobertoSkus)} SKUs sem cobertura`}
        />
        <StatPill
          label="A chegar"
          value={formatNum(resumo.aChegar)}
          dotClass="bg-info"
          sublabel="SKUs com pedido de suprimento"
        />
        <StatPill
          label="Sem previsão"
          value={formatNum(resumo.semPrevisao)}
          dotClass="bg-warning"
          valueClassName="text-warning"
          sublabel="SKUs sem pedido de suprimento"
        />

        <StatPill
          label="Pré-venda"
          value={formatNum(resumo.preVenda)}
          dotClass="bg-info"
          sublabel={`${formatNum(resumo.unAguardando)} un aguardando`}
        />
        <StatPill
          label="Não vendável"
          value={`${formatNum(resumo.bloqueadoUn)} un`}
          dotClass="bg-warning"
          valueClassName="text-warning"
          sublabel={`${formatNum(resumo.bloqueadoSkus)} SKUs`}
        />
        <StatPill
          label="Show Room SP"
          value={`${formatNum(resumo.showroomUn)} un`}
          dotClass="bg-muted-foreground"
          sublabel="fora do disponível"
        />
        <StatPill
          label="Indisponível"
          value={formatNum(resumo.indisponivel)}
          dotClass="bg-muted-foreground"
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
          <FilterSelectTrigger active={statusFiltro !== "todos"} className="w-[210px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUS_VENDA_ORDEM.map((s) => (
              <SelectItem key={s} value={s}>{rotuloStatusVenda(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={condicaoFiltro} onValueChange={(v) => { setCondicaoFiltro(v); setPagina(1); }}>
          <FilterSelectTrigger active={condicaoFiltro !== "todos"} className="w-[220px]">
            <SelectValue />
          </FilterSelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as posições</SelectItem>
            <SelectItem value="com_bloqueio">Com não vendável</SelectItem>
            <SelectItem value="com_showroom">Com Show Room</SelectItem>
            <SelectItem value="com_delta_bling">Divergente do Bling</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">
          {filtrados.length} {filtrados.length === 1 ? "produto" : "produtos"}
        </span>
      </div>

      <div ref={tableWrapperRef} className="rounded-md border bg-card overflow-x-auto">
        <TooltipProvider delayDuration={200}>
          <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:px-3 text-[13px]">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <SortableTableHead column="sku" sort={sort} onSort={setSort} className="w-[110px]">SKU</SortableTableHead>
                <SortableTableHead column="nome" sort={sort} onSort={setSort} className="min-w-[180px]">Produto</SortableTableHead>
                <SortableTableHead column="vendavel" sort={sort} onSort={setSort} align="right" className="w-[90px]">Vendável</SortableTableHead>
                <SortableTableHead column="bloqueado" sort={sort} onSort={setSort} align="right" className="w-[100px]">Não vendável</SortableTableHead>
                <SortableTableHead column="reservado" sort={sort} onSort={setSort} align="right" className="w-[95px]">Reservado</SortableTableHead>
                <SortableTableHead column="disponivel" sort={sort} onSort={setSort} align="right" className="w-[100px]">Disponível</SortableTableHead>
                <SortableTableHead column="descoberto" sort={sort} onSort={setSort} align="right" className="w-[100px]">Descoberto</SortableTableHead>
                <SortableTableHead column="showroom" sort={sort} onSort={setSort} align="right" className="w-[95px]">Show Room</SortableTableHead>

                <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-[145px]">Status</SortableTableHead>
                <SortableTableHead column="chegada" sort={sort} onSort={setSort} className="w-[175px]">Chegada</SortableTableHead>
                <SortableTableHead column="bling" sort={sort} onSort={setSort} align="right" className="w-[105px]">Ref. Bling</SortableTableHead>

              </TableRow>
            </TableHeader>
            <TableBody>
              {produtosQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Carregando…</TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">Nenhum produto encontrado.</TableCell>
                </TableRow>
              ) : (
                pageItems.map((p) => {
                  const alarme = p.status_venda === "vendido_sem_lastro";
                  const bloqueado = Number(p.bloqueado ?? 0);
                  const aguardando = Number(p.reservado_aguardando_produto ?? 0);
                  const showroom = Number(p.em_showroom ?? 0);
                  const disponivel = Number(p.disponivel ?? 0);
                  const descoberto = Number(p.descoberto ?? 0);
                  const delta = Number(p.delta_bling ?? 0);
                  const etaTexto = formatEta(p.eta_prevista, p.eta_precisao, p.status_suprimento);
                  const temEta = temPrevisao(p.eta_prevista, p.eta_precisao);
                  const tudoNoShowroom =
                    showroom > 0 && Number(p.fiscal_vendavel ?? 0) === 0 && descoberto > 0;

                  return (
                    <TableRow
                      key={p.sku}
                      className={cn(
                        "cursor-pointer",
                        alarme && "bg-destructive/5 hover:bg-destructive/10",
                      )}
                      onClick={() => setDetalhe({ sku: p.sku, nome: p.nome_comercial })}
                    >
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {alarme && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                          <span className="block max-w-[220px] truncate" title={p.nome_comercial ?? ""}>
                            {p.nome_comercial ?? "—"}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(p.fiscal_vendavel)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bloqueado === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-warning font-medium">{formatNum(bloqueado)}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              Posição em condição não vendável (avaria, quarentena, não conforme). O furo dessas condições é esperado por desenho — não é divergência a investigar.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {aguardando > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help">
                                {formatNum(p.reservado)}
                                <span className={cn("ml-1 text-xs", alarme ? "text-destructive" : "text-info")}>
                                  ({formatNum(aguardando)})
                                </span>
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {formatNum(aguardando)} unidades reservadas aguardando o produto chegar.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          formatNum(p.reservado)
                        )}
                      </TableCell>

                      <TableCell className="text-right tabular-nums font-medium">
                        {formatNum(disponivel)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {descoberto === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help text-destructive font-medium">{formatNum(descoberto)}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {formatNum(descoberto)} unidades já prometidas a cliente sem cobertura de estoque vendável.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {showroom === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn("cursor-help", tudoNoShowroom ? "text-warning font-medium" : "text-muted-foreground")}>
                                {formatNum(showroom)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {tudoNoShowroom
                                ? "Toda a mercadoria deste SKU está no Show Room de SP: vendável zerado no armazém e há unidades descobertas."
                                : "Posição no Show Room de SP. Controle interno — não é vendável e não entra no disponível."}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("font-normal", classeStatusVenda(p.status_venda))}>
                          {rotuloStatusVenda(p.status_venda)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.pedido_suprimento ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="cursor-help leading-tight max-w-[190px]">
                                <div className="font-medium truncate">
                                  <span className="text-muted-foreground font-normal">{rotuloOrigem(p.origem_suprimento)} · </span>
                                  {p.pedido_suprimento}
                                </div>
                                <div className={cn("truncate", temEta ? "text-muted-foreground" : "text-warning")}>
                                  {etaTexto}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {rotuloOrigem(p.origem_suprimento)} · {p.pedido_suprimento} — {temEta
                                ? etaTexto
                                : `${p.status_suprimento ?? "situação não informada"} · sem data de previsão`}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>


                      <TableCell className="text-right text-xs">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help leading-tight">
                              <div className="tabular-nums text-muted-foreground">
                                {p.referencia_bling === null || p.referencia_bling === undefined
                                  ? "—"
                                  : formatNum(p.referencia_bling)}
                              </div>
                              {delta !== 0 && (
                                <div className="tabular-nums text-muted-foreground">
                                  Δ {formatDelta(delta)}
                                </div>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-xs">
                            Saldo do Bling apenas como referência de conferência. Não é fonte de verdade e não influencia status nem disponibilidade.
                          </TooltipContent>
                        </Tooltip>
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

      <DetalheEstoqueSkuSheet
        sku={detalhe?.sku ?? null}
        nome={detalhe?.nome ?? null}
        onClose={() => setDetalhe(null)}
      />
    </div>
  );
}

function StatPill({
  label,
  value,
  dotClass,
  sublabel,
  valueClassName,
}: {
  label: string;
  value: string;
  dotClass: string;
  sublabel?: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden />
      <div className="flex flex-col leading-tight">
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={cn("font-semibold tabular-nums", adaptiveValueClass(value), valueClassName)}>
            {value}
          </span>
        </div>
        {sublabel && <span className="text-[10px] text-muted-foreground">{sublabel}</span>}
      </div>
    </div>
  );
}
