import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
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
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  classeStatusVenda, rotuloStatusVenda, STATUS_VENDA_ORDEM,
} from "@/lib/estoque/status-venda";
import { DetalheEstoqueSkuSheet } from "@/components/estoque/DetalheEstoqueSkuSheet";
import { PainelSyncEstoque } from "@/components/acervo/PainelSyncEstoque";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { formatError } from "@/lib/format-error";

import { PageShell } from "@/components/layout/PageShell";
interface EstoqueRede {
  sku: string;
  nome_comercial: string | null;
  cor_nome: string | null;
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
  "sku,nome_comercial,cor_nome,ativo,fiscal_vendavel,bloqueado,fisico,furo,reservado,reservado_aguardando_produto,disponivel,descoberto,em_showroom,nao_contabil,tem_razao,estoque_minimo,referencia_bling,delta_bling,status_venda,contagem_em,dias_desde_contagem,pedido_suprimento,origem_suprimento,eta_prevista,eta_precisao,status_suprimento";

/**
 * Códigos de centro das colunas fixas "SC" e "SP" (valor de `centro` em
 * vw_estoque_canais_centro). SC = armazém XPM Joinville; SP = estoque do Site em SP.
 */
const CENTRO_SC = "XPM-SC";
const CENTRO_SP = "SITE-SP";

interface CanalCentro {
  sku: string;
  centro: string;
  centro_nome: string | null;
  vende: boolean | null;
  fiscal_total: number | null;
  fisico_total: number | null;
  reservado: number | null;
  disponivel: number | null;
  shopify_atual: number | null;
  bling_atual: number | null;
  shopify_diverge: boolean | null;
  bling_diverge: boolean | null;
}

const COLS_CANAIS =
  "sku,centro,centro_nome,vende,fiscal_total,fisico_total,reservado,disponivel,shopify_atual,bling_atual,shopify_diverge,bling_diverge";

type Col =
  | "sku"
  | "nome"
  | "cor"
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
  const [centroFiltro, setCentroFiltro] = useState<string>("todos");
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
    // CARGA-DO-BANCO (09/09/2026): view composta, cara. Cache maior evita
    // refetch em cascata quando várias abas estão abertas.
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<EstoqueRede[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_rede")
        .select(COLS)
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as EstoqueRede[];
    },
  });

  const canaisQuery = useQuery({
    queryKey: ["vw_estoque_canais_centro"],
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<CanalCentro[]> => {
      const out: CanalCentro[] = [];
      const TAM = 1000;
      for (let offset = 0; ; offset += TAM) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("vw_estoque_canais_centro")
          .select(COLS_CANAIS)
          .order("sku").order("centro")
          .range(offset, offset + TAM - 1);
        if (error) throw error;
        out.push(...((data ?? []) as CanalCentro[]));
        if ((data ?? []).length < TAM) break;
      }
      return out;
    },
  });

  // Código de cadastro por SKU (vw_estoque_rede não traz cod_cadastro).
  const codQuery = useQuery({
    queryKey: ["sncf_produtos_cod_por_sku"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Map<string, string>> => {
      const m = new Map<string, string>();
      const TAM = 1000;
      for (let offset = 0; ; offset += TAM) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from("sncf_produtos")
          .select("sku,cod_cadastro")
          .not("sku", "is", null)
          .order("sku")
          .range(offset, offset + TAM - 1);
        if (error) throw error;
        for (const r of (data ?? []) as { sku: string; cod_cadastro: string | null }[]) {
          if (r.cod_cadastro) m.set(r.sku, r.cod_cadastro);
        }
        if ((data ?? []).length < TAM) break;
      }
      return m;
    },
  });

  // Última sincronização (qualquer rotina) para o estado do cabeçalho.
  const syncQuery = useQuery({
    queryKey: ["vw_estoque_sync_status", "ultima_execucao"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_sync_status")
        .select("ultima_execucao")
        .order("ultima_execucao", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0]?.ultima_execucao as string | null) ?? null;
    },
  });

  const canaisPorSku = useMemo(() => {
    const m = new Map<string, CanalCentro[]>();
    for (const c of canaisQuery.data ?? []) m.set(c.sku, [...(m.get(c.sku) ?? []), c]);
    return m;
  }, [canaisQuery.data]);

  const skusDivergentes = useMemo(() => {
    const s = new Set<string>();
    for (const c of canaisQuery.data ?? []) if (c.shopify_diverge || c.bling_diverge) s.add(c.sku);
    return s;
  }, [canaisQuery.data]);

  const centrosPresentes = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const c of canaisQuery.data ?? []) if (!m.has(c.centro)) m.set(c.centro, c.centro_nome);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [canaisQuery.data]);

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
    const dispCentro = (p: EstoqueRede) => {
      if (centroFiltro === "todos") return Number(p.disponivel ?? 0);
      const c = (canaisPorSku.get(p.sku) ?? []).find((x) => x.centro === centroFiltro);
      return Number(c?.disponivel ?? 0);
    };
    const base = lista.filter((p) => {
      if (centroFiltro !== "todos" && !(canaisPorSku.get(p.sku) ?? []).some((c) => c.centro === centroFiltro)) return false;
      if (statusFiltro !== "todos" && p.status_venda !== statusFiltro) return false;
      const bloq = Number(p.bloqueado ?? 0);
      if (condicaoFiltro === "com_bloqueio" && !(bloq > 0)) return false;
      if (condicaoFiltro === "com_showroom" && !(Number(p.em_showroom ?? 0) > 0)) return false;
      if (condicaoFiltro === "com_delta_bling" && Number(p.delta_bling ?? 0) === 0) return false;
      if (condicaoFiltro === "com_descoberto" && !(Number(p.descoberto ?? 0) > 0)) return false;
      if (condicaoFiltro === "com_canal_diverge" && !skusDivergentes.has(p.sku)) return false;
      if (!q) return true;
      return (
        p.sku?.toLowerCase().includes(q) ||
        (codQuery.data?.get(p.sku) ?? "").toLowerCase().includes(q) ||
        p.nome_comercial?.toLowerCase().includes(q) ||
        p.cor_nome?.toLowerCase().includes(q)
      );
    });
    return ordenarPor<EstoqueRede, Col>(base, sort, {
      sku: (p) => p.sku,
      nome: (p) => p.nome_comercial ?? "",
      cor: (p) => p.cor_nome ?? "",
      vendavel: (p) => Number(p.fiscal_vendavel ?? 0),
      bloqueado: (p) => Number(p.bloqueado ?? 0),
      reservado: (p) => Number(p.reservado ?? 0),
      aguardando: (p) => Number(p.reservado_aguardando_produto ?? 0),
      disponivel: (p) => dispCentro(p),
      descoberto: (p) => Number(p.descoberto ?? 0),
      showroom: (p) => Number(p.em_showroom ?? 0),
      chegada: (p) => p.eta_prevista ?? "",
      bling: (p) => Number(p.delta_bling ?? 0),

      status: (p) => STATUS_VENDA_ORDEM.indexOf(p.status_venda as never),
    });
  }, [lista, busca, statusFiltro, condicaoFiltro, sort, centroFiltro, canaisPorSku, skusDivergentes, codQuery.data]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = filtrados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const inicioRange = filtrados.length === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, filtrados.length);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  const totalDisponivel = lista.reduce((s, p) => s + Number(p.disponivel ?? 0), 0);
  const estadoCabecalho = produtosQuery.isLoading
    ? "Carregando…"
    : `${formatNum(lista.length)} produtos · ${formatNum(totalDisponivel)} un disponíveis · ${
        syncQuery.data ? `sincronizado ${tempoRelativo(syncQuery.data)}` : "sem sincronização registrada"
      }`;
  const detalheLinha = detalhe ? lista.find((p) => p.sku === detalhe.sku) ?? null : null;

  function aplicarRecorte(tipo: "status" | "condicao", valor: string) {
    if (tipo === "status") { setStatusFiltro(valor); setCondicaoFiltro("todos"); }
    else { setCondicaoFiltro(valor); setStatusFiltro("todos"); }
    setPagina(1);
  }

  return (
    <PageShell variant="dados" className="animate-casa-fade-in">
      <PageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "SOPs" },
          { label: "Produto" },
          { label: "Cockpit do Estoque" },
        ]}
        titulo="Cockpit do Estoque"
        estado={estadoCabecalho}
        acoes={
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void produtosQuery.refetch(); void canaisQuery.refetch(); void syncQuery.refetch(); }}
            disabled={produtosQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", produtosQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-2">
            <ChevronDown className="h-4 w-4" />Sincronização
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <PainelSyncEstoque />
        </CollapsibleContent>
      </Collapsible>

      {produtosQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar o estoque: {formatError(produtosQuery.error)}
        </div>
      )}
      {canaisQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar estoque por centro/canais: {formatError(canaisQuery.error)}
        </div>
      )}
      {codQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar códigos de cadastro: {formatError(codQuery.error)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <CartaoNumero
          rotulo="Vendido sem lastro"
          valor={`${formatNum(resumo.semLastroUn)} un`}
          sub={`${formatNum(resumo.semLastroSkus)} SKUs`}
          alerta={resumo.semLastroUn > 0 ? "destructive" : null}
          ativo={statusFiltro === "vendido_sem_lastro"}
          onClick={() => aplicarRecorte("status", "vendido_sem_lastro")}
        />
        <CartaoNumero
          rotulo="Descoberto"
          valor={`${formatNum(resumo.descobertoUn)} un`}
          sub={`${formatNum(resumo.descobertoSkus)} SKUs`}
          alerta={resumo.descobertoUn > 0 ? "destructive" : null}
          ativo={condicaoFiltro === "com_descoberto"}
          onClick={() => aplicarRecorte("condicao", "com_descoberto")}
        />
        <CartaoNumero
          rotulo="Sem previsão de chegada"
          valor={`${formatNum(resumo.semPrevisao)} SKUs`}
          alerta={resumo.semPrevisao > 0 ? "warning" : null}
          ativo={statusFiltro === "sem_previsao"}
          onClick={() => aplicarRecorte("status", "sem_previsao")}
        />
        <CartaoNumero
          rotulo="Canais divergentes"
          valor={`${formatNum(skusDivergentes.size)} SKUs`}
          alerta={skusDivergentes.size > 0 ? "warning" : null}
          ativo={condicaoFiltro === "com_canal_diverge"}
          onClick={() => aplicarRecorte("condicao", "com_canal_diverge")}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <FilterInput
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
            placeholder="Buscar por código, SKU ou nome"
            className="pl-9"
          />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Select value={statusFiltro} onValueChange={(v) => { setStatusFiltro(v); setPagina(1); }}>
            <FilterSelectTrigger active={statusFiltro !== "todos"} className="w-[190px]">
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
            <FilterSelectTrigger active={condicaoFiltro !== "todos"} className="w-[200px]">
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as posições</SelectItem>
              <SelectItem value="com_descoberto">Com descoberto</SelectItem>
              <SelectItem value="com_bloqueio">Com não vendável</SelectItem>
              <SelectItem value="com_showroom">Com Show Room</SelectItem>
              <SelectItem value="com_canal_diverge">Canal divergente</SelectItem>
              <SelectItem value="com_delta_bling">Divergente do Bling</SelectItem>
            </SelectContent>
          </Select>
          <Select value={centroFiltro} onValueChange={(v) => { setCentroFiltro(v); setPagina(1); }}>
            <FilterSelectTrigger active={centroFiltro !== "todos"} className="w-[190px]">
              <SelectValue />
            </FilterSelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os centros</SelectItem>
              {centrosPresentes.map(([c, nome]) => (
                <SelectItem key={c} value={c}>{nome ? `${c} · ${nome}` : c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div ref={tableWrapperRef} className="rounded-md border bg-card">
        <TooltipProvider delayDuration={200}>
          <Table className="table-fixed text-[12px] [&_td]:py-[10px] [&_td]:px-3 [&_th]:px-3 [&_tr]:border-b">
            <TableHeader className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_hsl(var(--border))]">
              <TableRow>
                <SortableTableHead column="sku" sort={sort} onSort={setSort} className="w-[120px]">Código</SortableTableHead>
                <SortableTableHead column="nome" sort={sort} onSort={setSort}>Produto</SortableTableHead>
                <SortableTableHead column="status" sort={sort} onSort={setSort} className="w-[150px]">Situação</SortableTableHead>
                <SortableTableHead column="chegada" sort={sort} onSort={setSort} className="w-[90px]">Chegada</SortableTableHead>
                <SortableTableHead column="disponivel" sort={sort} onSort={setSort} align="right" className="w-[100px]">
                  {centroFiltro !== "todos" ? `Disp. (${centroFiltro})` : "Disponível"}
                </SortableTableHead>
                <TableHead className="text-right w-[70px]">SC</TableHead>
                <TableHead className="text-right w-[70px]">SP</TableHead>
                <SortableTableHead column="showroom" sort={sort} onSort={setSort} align="right" className="w-[95px]">Show Room</SortableTableHead>
                <SortableTableHead column="reservado" sort={sort} onSort={setSort} align="right" className="w-[95px]">Reservado</SortableTableHead>
                <SortableTableHead column="descoberto" sort={sort} onSort={setSort} align="right" className="w-[100px]">Descoberto</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:nth-child(even)]:bg-transparent">
              {produtosQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Carregando…</TableCell>
                </TableRow>
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Nenhum produto encontrado.</TableCell>
                </TableRow>
              ) : (
                pageItems.map((p) => {
                  const aguardando = Number(p.reservado_aguardando_produto ?? 0);
                  const showroom = Number(p.em_showroom ?? 0);
                  const descoberto = Number(p.descoberto ?? 0);
                  const canais = canaisPorSku.get(p.sku) ?? [];
                  const cSC = canais.find((c) => c.centro === CENTRO_SC);
                  const cSP = canais.find((c) => c.centro === CENTRO_SP);
                  const cFiltro = centroFiltro !== "todos" ? canais.find((c) => c.centro === centroFiltro) : null;
                  const disponivelMostrado = cFiltro ? Number(cFiltro.disponivel ?? 0) : Number(p.disponivel ?? 0);
                  const divergencias = divergenciasDe(canais);
                  const temEta = temPrevisao(p.eta_prevista, p.eta_precisao);
                  const cod = codQuery.data?.get(p.sku);

                  return (
                    <TableRow
                      key={p.sku}
                      className="cursor-pointer"
                      onClick={() => setDetalhe({ sku: p.sku, nome: p.nome_comercial })}
                    >
                      <TableCell className="leading-tight">
                        <div className="font-mono truncate">{cod ?? <span className="text-muted-foreground">—</span>}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{p.sku}</div>
                      </TableCell>
                      <TableCell className="leading-tight">
                        <div className="font-medium truncate" title={p.nome_comercial ?? ""}>{p.nome_comercial ?? "—"}</div>
                        {p.cor_nome && <div className="text-[11px] text-muted-foreground truncate">{p.cor_nome}</div>}
                      </TableCell>
                      <TableCell className="leading-tight">
                        <Badge variant="outline" className={cn("font-normal", classeStatusVenda(p.status_venda))}>
                          {rotuloStatusVenda(p.status_venda)}
                        </Badge>
                        {divergencias.length > 0 && (
                          <div className="mt-1 text-[11px] text-warning" title={divergencias.join("\n")}>canal diverge</div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {p.pedido_suprimento || p.eta_prevista ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={cn("cursor-help", !temEta && "text-warning")}>
                                {temEta ? formatDataCurta(p.eta_prevista) : "—"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">
                              {p.pedido_suprimento ? `${rotuloOrigem(p.origem_suprimento)} · ${p.pedido_suprimento} — ` : ""}
                              {formatEta(p.eta_prevista, p.eta_precisao, p.status_suprimento)}
                            </TooltipContent>
                          </Tooltip>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{formatNum(disponivelMostrado)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cSC ? formatNum(cSC.disponivel) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {cSP ? formatNum(cSP.disponivel) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {showroom === 0 ? <span className="text-muted-foreground">—</span> : formatNum(showroom)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNum(p.reservado)}
                        {aguardando > 0 && (
                          <span className="ml-1 text-[11px] text-info" title={`${formatNum(aguardando)} un aguardando o produto chegar`}>
                            ({formatNum(aguardando)})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {descoberto === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="text-destructive font-medium" title={`${formatNum(descoberto)} un prometidas sem cobertura de estoque vendável`}>
                            {formatNum(descoberto)}
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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="tabular-nums">
            {formatNum(filtrados.length)} produtos · {formatNum(pageItems.length)} exibidos
            {filtrados.length > 0 && <> ({inicioRange}–{fimRange})</>}
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
        extra={detalhe ? (
          <>
            {detalheLinha && (
              <section className="mt-6">
                <h3 className="text-sm font-medium mb-2">Cadastro e posição</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">Código</dt>
                  <dd className="font-mono">{codQuery.data?.get(detalheLinha.sku) ?? "—"}</dd>
                  <dt className="text-muted-foreground">Cor</dt>
                  <dd>{detalheLinha.cor_nome ?? "—"}</dd>
                  <dt className="text-muted-foreground">Vendável</dt>
                  <dd className="tabular-nums">{formatNum(detalheLinha.fiscal_vendavel)}</dd>
                  <dt className="text-muted-foreground">Não vendável</dt>
                  <dd className={cn("tabular-nums", Number(detalheLinha.bloqueado ?? 0) > 0 && "text-warning font-medium")}>
                    {Number(detalheLinha.bloqueado ?? 0) === 0 ? "—" : formatNum(detalheLinha.bloqueado)}
                  </dd>
                  <dt className="text-muted-foreground">Ref. Bling</dt>
                  <dd className="tabular-nums">
                    {detalheLinha.referencia_bling == null ? "—" : formatNum(detalheLinha.referencia_bling)}
                    {Number(detalheLinha.delta_bling ?? 0) !== 0 && (
                      <span className="ml-2 text-muted-foreground">Δ {formatDelta(detalheLinha.delta_bling)}</span>
                    )}
                  </dd>
                  <dt className="text-muted-foreground">Chegada</dt>
                  <dd>
                    {detalheLinha.pedido_suprimento
                      ? `${rotuloOrigem(detalheLinha.origem_suprimento)} · ${detalheLinha.pedido_suprimento} — ${formatEta(detalheLinha.eta_prevista, detalheLinha.eta_precisao, detalheLinha.status_suprimento)}`
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Canais</dt>
                  <dd className={cn(divergenciasDe(canaisPorSku.get(detalheLinha.sku) ?? []).length > 0 && "text-warning")}>
                    {divergenciasDe(canaisPorSku.get(detalheLinha.sku) ?? []).join(" · ") || "OK"}
                  </dd>
                </dl>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Saldo do Bling é só referência de conferência — não é fonte de verdade.
                </p>
              </section>
            )}
            <section className="mt-6">
              <h3 className="text-sm font-medium mb-2">Por centro</h3>
              {canaisQuery.isError ? (
                <p className="text-sm text-destructive">Falha ao carregar canais: {formatError(canaisQuery.error)}</p>
              ) : (canaisPorSku.get(detalhe.sku) ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem linha por centro para este SKU.</p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader><TableRow>
                      <TableHead>Centro</TableHead><TableHead className="text-right">Fiscal</TableHead>
                      <TableHead className="text-right">Físico</TableHead><TableHead className="text-right">Reservado</TableHead>
                      <TableHead className="text-right">Disponível</TableHead><TableHead className="text-right">Shopify</TableHead>
                      <TableHead className="text-right">Bling</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {(canaisPorSku.get(detalhe.sku) ?? []).map((c) => (
                        <TableRow key={c.centro}>
                          <TableCell title={c.centro_nome ?? ""}>{c.centro}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNum(c.fiscal_total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNum(c.fisico_total)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNum(c.reservado)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{formatNum(c.disponivel)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", c.shopify_diverge && "bg-warning/15 text-warning font-medium")}>
                            {c.shopify_atual == null ? "—" : formatNum(c.shopify_atual)}
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums", c.bling_diverge && "bg-warning/15 text-warning font-medium")}>
                            {c.bling_atual == null ? "—" : formatNum(c.bling_atual)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        ) : null}
      />
    </PageShell>
  );
}

function divergenciasDe(canais: CanalCentro[]): string[] {
  return canais.flatMap((c) => [
    ...(c.shopify_diverge ? [`${c.centro} · Shopify`] : []),
    ...(c.bling_diverge ? [`${c.centro} · Bling`] : []),
  ]);
}

function formatDataCurta(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function tempoRelativo(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(min)) return "—";
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.round(h / 24)} d`;
}

function CartaoNumero({
  rotulo, valor, sub, alerta, ativo, onClick,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  alerta: "destructive" | "warning" | null;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50",
        alerta === "destructive" && "border-l-[3px] border-l-destructive",
        alerta === "warning" && "border-l-[3px] border-l-warning",
        ativo && "ring-1 ring-ring",
      )}
    >
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="mt-1 text-2xl font-medium tabular-nums text-foreground">{valor}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </button>
  );
}
