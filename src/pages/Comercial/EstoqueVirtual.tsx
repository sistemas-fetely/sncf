import { useMemo, useState } from "react";
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
import { type SortState, ordenarPor } from "@/components/shared/SortableTableHead";
import { type DirecaoOrdenacao, LINHA_CABECALHO_COLADO } from "@/components/tabela/CabecalhoOrdenavel";
import { DEFAULT_PAGE_SIZE, RodapePaginacao } from "@/components/tabela/RodapePaginacao";
import { ArrowDown, ArrowUp, ChevronDown, Info, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { classeStatusVenda, rotuloStatusVenda } from "@/lib/estoque/status-venda";
import { DetalheEstoqueSkuSheet } from "@/components/estoque/DetalheEstoqueSkuSheet";
import { PainelSyncEstoque } from "@/components/acervo/PainelSyncEstoque";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatError } from "@/lib/format-error";
import { PageShell } from "@/components/layout/PageShell";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Uma linha por SKU × centro (centro null = produto sem razão). */
interface LinhaCockpit {
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  cor_nome: string | null;
  fase: string | null;
  colecao: string | null;
  centro: string | null;
  contabil: number | null;
  fisico: number | null;
  virtual: number | null;
  reservado: number | null;
  custo_unitario: number | null;
  valor_custo: number | null;
  vendas_janela: number | null;
  janela_dias: number | null;
  tempo_estoque_dias: number | null;
  furo: number | null;
  contagem_em_dia: boolean | null;
  exige_contagem: boolean | null;
  situacao: string | null;
  em_transito: number | null;
  eta_embarque: string | null;
  real_centro: number | null;
  divergencia_real: number | null;
  ticket_medio: number | null;
  fonte_ticket: string | null;
  valor_venda: number | null;
  valor_empenhado: number | null;
  saude: string | null;
}

const COLS =
  "cod_cadastro,sku,nome_comercial,cor_nome,fase,colecao,centro,contabil,fisico,virtual,reservado,custo_unitario,valor_custo,vendas_janela,janela_dias,tempo_estoque_dias,furo,contagem_em_dia,exige_contagem,situacao,em_transito,eta_embarque,real_centro,divergencia_real,ticket_medio,fonte_ticket,valor_venda,valor_empenhado,saude";

/** Linha exibida: produto (Centro = Todos) ou produto no centro escolhido. */
interface LinhaTabela {
  chave: string;
  cod_cadastro: string | null;
  sku: string | null;
  nome_comercial: string | null;
  cor_nome: string | null;
  situacao: string | null;
  contabil: number;
  fisico: number;
  virtual: number;
  reservado: number;
  valor_custo: number;
  vendas_janela: number;
  janela_dias: number;
  tempo: number | null;
  eta_embarque: string | null;
  valor_venda: number;
  valor_empenhado: number;
  real_xpm: number | null;
  real_site: number | null;
  divergencia: number;
  ticket: number | null;
  fonte_ticket: string | null;
  saude: string | null;
  em_transito: number;
}

type Visao = "estoque" | "valor";
const SORT_PADRAO: Record<Visao, SortState<Col>> = {
  estoque: { column: "virtual", direction: "desc" },
  valor: { column: "vvenda", direction: "desc" },
};
const PESO_SAUDE: Record<string, number> = { ok: 1, contagem_vencida: 2, furo: 3, diverge_real: 3 };
function piorSaude(a: string | null, b: string | null) {
  return (PESO_SAUDE[b ?? ""] ?? 0) > (PESO_SAUDE[a ?? ""] ?? 0) ? b : a;
}
const SAUDE_INFO: Record<string, { cor: string; texto: string }> = {
  ok: { cor: "bg-success", texto: "Sem pendências" },
  contagem_vencida: { cor: "bg-warning", texto: "Contagem vencida" },
  furo: { cor: "bg-destructive", texto: "Furo entre contábil e físico" },
  diverge_real: { cor: "bg-destructive", texto: "Armazém difere do SNCF" },
};

interface CanalCentro {
  sku: string;
  centro: string;
  centro_nome: string | null;
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
  "sku,centro,centro_nome,fiscal_total,fisico_total,reservado,disponivel,shopify_atual,bling_atual,shopify_diverge,bling_diverge";

interface Onboarding { com_razao: number; skus_ativos: number; seguro_desligar_bling: boolean }

type Col = "cod" | "nome" | "situacao" | "saude" | "contabil" | "fisico" | "realxpm" | "realsite" | "diverg" | "virtual" | "tempo" | "chegada" | "reservado" | "ticket" | "vcusto" | "vvenda" | "vemp" | "transito";

const n = (v: number | null | undefined) => Number(v ?? 0);
function formatNum(v: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(n(v));
}
function formatBRL(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function tempoDias(virtual: number, vendas: number, janela: number): number | null {
  if (!(vendas > 0) || !(janela > 0)) return null;
  return Math.round(virtual / (vendas / janela));
}
const chaveProduto = (l: LinhaCockpit) => l.sku ?? l.cod_cadastro ?? "";

/**
 * Cabeçalho ordenável com title no <th>: igual ao CabecalhoOrdenavel
 * compartilhado, mas permite tooltip com o rótulo completo e garante que
 * nenhum cabeçalho ultrapasse a própria coluna (table-fixed).
 */
function CabecalhoColuna({
  rotulo, title, dir, onOrdenar, className, alinharDireita = false,
}: {
  rotulo: string;
  /** Tooltip do cabeçalho; default = o próprio rótulo. */
  title?: string;
  dir: DirecaoOrdenacao | null;
  onOrdenar: () => void;
  className?: string;
  alinharDireita?: boolean;
}) {
  return (
    <TableHead
      className={cn(
        "overflow-hidden text-ellipsis whitespace-nowrap [&>button]:max-w-full [&>button]:truncate",
        className,
      )}
      title={title ?? rotulo}
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={onOrdenar}
        className={cn(
          "group inline-flex items-center gap-1 transition-colors hover:text-foreground",
          dir && "text-foreground",
          alinharDireita && "w-full justify-end",
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
        {/* O ícone só existe quando há ordenação ativa: o placeholder invisível
            consumia espaço e fazia cabeçalhos numéricos estourarem a coluna. */}
        {dir === "asc" ? (
          <ArrowUp className="h-3 w-3 shrink-0" />
        ) : dir === "desc" ? (
          <ArrowDown className="h-3 w-3 shrink-0" />
        ) : null}
      </button>
    </TableHead>
  );
}

async function carregarPaginado<T>(tabela: string, cols: string, ordem: string[]): Promise<T[]> {
  const out: T[] = [];
  const TAM = 1000;
  for (let offset = 0; ; offset += TAM) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from(tabela).select(cols);
    for (const o of ordem) q = q.order(o, { nullsFirst: false });
    const { data, error } = await q.range(offset, offset + TAM - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < TAM) break;
  }
  return out;
}

export default function EstoqueVirtual() {
  const [busca, setBusca] = useState("");
  const [faseFiltro, setFaseFiltro] = useState("todos");
  const [colecaoFiltro, setColecaoFiltro] = useState("todos");
  const [centroFiltro, setCentroFiltro] = useState("todos");
  const [situacaoFiltro, setSituacaoFiltro] = useState("todos");
  const [detalhe, setDetalhe] = useState<{ sku: string; nome: string | null } | null>(null);
  const [visao, setVisao] = useState<Visao>("estoque");
  const [sort, setSort] = useState<SortState<Col> | null>(SORT_PADRAO.estoque);
  const [pagina, setPagina] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const cockpitQuery = useQuery({
    queryKey: ["vw_estoque_cockpit"],
    staleTime: 3 * 60 * 1000,
    queryFn: () => carregarPaginado<LinhaCockpit>("vw_estoque_cockpit", COLS, ["sku", "centro"]),
  });

  const canaisQuery = useQuery({
    queryKey: ["vw_estoque_canais_centro"],
    staleTime: 3 * 60 * 1000,
    queryFn: () => carregarPaginado<CanalCentro>("vw_estoque_canais_centro", COLS_CANAIS, ["sku", "centro"]),
  });

  const onboardingQuery = useQuery({
    queryKey: ["vw_estoque_onboarding_progresso"],
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<Onboarding | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_estoque_onboarding_progresso")
        .select("com_razao,skus_ativos,seguro_desligar_bling")
        .limit(1);
      if (error) throw error;
      return (data?.[0] as Onboarding) ?? null;
    },
  });

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

  const linhas = cockpitQuery.data ?? [];

  const opcoes = useMemo(() => {
    const uniq = (f: (l: LinhaCockpit) => string | null) =>
      [...new Set(linhas.map(f).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b));
    return {
      fases: uniq((l) => l.fase),
      colecoes: uniq((l) => l.colecao),
      centros: uniq((l) => l.centro),
      situacoes: uniq((l) => l.situacao),
    };
  }, [linhas]);

  const canaisPorSku = useMemo(() => {
    const m = new Map<string, CanalCentro[]>();
    for (const c of canaisQuery.data ?? []) m.set(c.sku, [...(m.get(c.sku) ?? []), c]);
    return m;
  }, [canaisQuery.data]);

  // Linhas produto×centro do recorte (todos os filtros).
  const recorte = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (centroFiltro !== "todos" && l.centro !== centroFiltro) return false;
      if (faseFiltro !== "todos" && l.fase !== faseFiltro) return false;
      if (colecaoFiltro !== "todos" && l.colecao !== colecaoFiltro) return false;
      if (situacaoFiltro !== "todos" && l.situacao !== situacaoFiltro) return false;
      if (!q) return true;
      return (
        (l.sku ?? "").toLowerCase().includes(q) ||
        (l.cod_cadastro ?? "").toLowerCase().includes(q) ||
        (l.nome_comercial ?? "").toLowerCase().includes(q) ||
        (l.cor_nome ?? "").toLowerCase().includes(q)
      );
    });
  }, [linhas, busca, centroFiltro, faseFiltro, colecaoFiltro, situacaoFiltro]);

  const tabela = useMemo((): LinhaTabela[] => {
    if (centroFiltro !== "todos") {
      return recorte.map((l) => ({
        chave: `${chaveProduto(l)}|${l.centro}`,
        cod_cadastro: l.cod_cadastro, sku: l.sku, nome_comercial: l.nome_comercial, cor_nome: l.cor_nome,
        situacao: l.situacao, contabil: n(l.contabil), fisico: n(l.fisico), virtual: n(l.virtual),
        reservado: n(l.reservado), valor_custo: n(l.valor_custo), vendas_janela: n(l.vendas_janela),
        janela_dias: n(l.janela_dias),
        tempo: l.tempo_estoque_dias ?? tempoDias(n(l.virtual), n(l.vendas_janela), n(l.janela_dias)),
        eta_embarque: l.eta_embarque,
        valor_venda: n(l.valor_venda), valor_empenhado: n(l.valor_empenhado),
        real_xpm: l.centro === "XPM-SC" ? l.real_centro : null,
        real_site: l.centro === "SITE-SP" ? l.real_centro : null,
        divergencia: n(l.divergencia_real), ticket: l.ticket_medio, fonte_ticket: l.fonte_ticket,
        saude: l.saude, em_transito: n(l.em_transito),
      }));
    }
    const m = new Map<string, LinhaTabela>();
    for (const l of recorte) {
      const k = chaveProduto(l);
      const a = m.get(k);
      if (!a) {
        m.set(k, {
          chave: k, cod_cadastro: l.cod_cadastro, sku: l.sku, nome_comercial: l.nome_comercial,
          cor_nome: l.cor_nome, situacao: l.situacao, contabil: n(l.contabil), fisico: n(l.fisico),
          virtual: n(l.virtual), reservado: n(l.reservado), valor_custo: n(l.valor_custo),
          vendas_janela: n(l.vendas_janela), janela_dias: n(l.janela_dias), tempo: null,
          eta_embarque: l.eta_embarque,
          valor_venda: n(l.valor_venda), valor_empenhado: n(l.valor_empenhado),
          real_xpm: l.centro === "XPM-SC" ? l.real_centro : null,
          real_site: l.centro === "SITE-SP" ? l.real_centro : null,
          divergencia: n(l.divergencia_real), ticket: l.ticket_medio, fonte_ticket: l.fonte_ticket,
          saude: l.saude, em_transito: n(l.em_transito),
        });
      } else {
        a.contabil += n(l.contabil);
        a.fisico += n(l.fisico);
        a.virtual += n(l.virtual);
        a.reservado += n(l.reservado);
        a.valor_custo += n(l.valor_custo);
        a.vendas_janela += n(l.vendas_janela);
        a.janela_dias = Math.max(a.janela_dias, n(l.janela_dias));
        a.situacao ??= l.situacao;
        a.cod_cadastro ??= l.cod_cadastro;
        a.valor_venda += n(l.valor_venda);
        a.valor_empenhado += n(l.valor_empenhado);
        a.divergencia += n(l.divergencia_real);
        if (l.centro === "XPM-SC") a.real_xpm = l.real_centro;
        if (l.centro === "SITE-SP") a.real_site = l.real_centro;
        a.saude = piorSaude(a.saude, l.saude);
        a.em_transito = Math.max(a.em_transito, n(l.em_transito));
        if (l.eta_embarque && (!a.eta_embarque || l.eta_embarque < a.eta_embarque)) a.eta_embarque = l.eta_embarque;
      }
    }
    const out = [...m.values()];
    for (const a of out) {
      a.tempo = tempoDias(a.virtual, a.vendas_janela, a.janela_dias);
      if (a.contabil > 0) a.ticket = a.valor_venda / a.contabil;
    }
    return out;
  }, [recorte, centroFiltro]);

  const cartoes = useMemo(() => {
    let contabil = 0, valor = 0, valorVenda = 0, vendas = 0, virtual = 0, janela = 0, saudaveis = 0;
    const transito = new Map<string, number>();
    for (const l of recorte) {
      contabil += n(l.contabil);
      valor += n(l.valor_custo);
      valorVenda += n(l.valor_venda);
      vendas += n(l.vendas_janela);
      virtual += n(l.virtual);
      janela = Math.max(janela, n(l.janela_dias));
      if (n(l.furo) === 0 && (l.contagem_em_dia || l.exige_contagem === false)) saudaveis++;
      const k = chaveProduto(l);
      transito.set(k, Math.max(transito.get(k) ?? 0, n(l.em_transito)));
    }
    const giro = contabil > 0 && janela > 0 ? (vendas / contabil) * (365 / janela) : null;
    const tempo = tempoDias(virtual, vendas, janela);
    const saude = recorte.length > 0 ? (saudaveis / recorte.length) * 100 : null;
    const emTransito = [...transito.values()].reduce((s, v) => s + v, 0);
    return { contabil, valor, valorVenda, vendas, janela, giro, tempo, saude, emTransito };
  }, [recorte]);

  const ordenados = useMemo(
    () =>
      ordenarPor<LinhaTabela, Col>(tabela, sort, {
        cod: (p) => p.cod_cadastro ?? "",
        nome: (p) => p.nome_comercial ?? "",
        situacao: (p) => p.situacao ?? "",
        saude: (p) => PESO_SAUDE[p.saude ?? ""] ?? 0,
        contabil: (p) => p.contabil,
        fisico: (p) => p.fisico,
        realxpm: (p) => p.real_xpm ?? -Infinity,
        realsite: (p) => p.real_site ?? -Infinity,
        diverg: (p) => p.divergencia,
        virtual: (p) => p.virtual,
        // nulos por último na ordem crescente (menor cobertura primeiro)
        tempo: (p) => p.tempo ?? Number.MAX_SAFE_INTEGER,
        chegada: (p) => p.eta_embarque ?? "",
        reservado: (p) => p.reservado,
        ticket: (p) => p.ticket ?? -1,
        vcusto: (p) => p.valor_custo,
        vvenda: (p) => p.valor_venda,
        vemp: (p) => p.valor_empenhado,
        transito: (p) => p.em_transito,
      }),
    [tabela, sort],
  );

  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = ordenados.slice((paginaAtual - 1) * pageSize, paginaAtual * pageSize);
  const hoje = new Date().toISOString().slice(0, 10);

  const totalProdutos = useMemo(() => new Set(linhas.map(chaveProduto)).size, [linhas]);
  const totalVirtual = linhas.reduce((s, l) => s + n(l.virtual), 0);
  const estadoCabecalho = cockpitQuery.isLoading
    ? "Carregando…"
    : `${formatNum(totalProdutos)} produtos · ${formatNum(totalVirtual)} un virtuais · ${
        syncQuery.data ? `sincronizado ${tempoRelativo(syncQuery.data)}` : "sem sincronização registrada"
      }`;
  const detalheLinha = detalhe ? tabela.find((p) => p.sku === detalhe.sku) ?? null : null;

  function ordenarColuna(coluna: Col) {
    setSort((atual) => {
      if (atual?.column !== coluna) return { column: coluna, direction: "asc" };
      if (atual.direction === "asc") return { column: coluna, direction: "desc" };
      return null;
    });
    setPagina(1);
  }

  function limparFiltros() {
    setBusca("");
    setFaseFiltro("todos");
    setColecaoFiltro("todos");
    setCentroFiltro("todos");
    setSituacaoFiltro("todos");
    setPagina(1);
  }

  const cabecalho = (coluna: Col, rotulo: string, className: string, alinharDireita = false, title?: string) => (
    <CabecalhoColuna
      rotulo={rotulo}
      title={title ?? rotulo}
      dir={sort?.column === coluna ? sort.direction : null}
      onOrdenar={() => ordenarColuna(coluna)}
      className={cn("font-medium", className)}
      alinharDireita={alinharDireita}
    />
  );

  const filtroSelect = (
    valor: string, set: (v: string) => void, todos: string, itens: string[], w: string,
    rotulo: (v: string) => string = (v) => v,
  ) => (
    <Select value={valor} onValueChange={(v) => { set(v); setPagina(1); }}>
      <FilterSelectTrigger active={valor !== "todos"} className={w}><SelectValue /></FilterSelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{todos}</SelectItem>
        {itens.map((v) => <SelectItem key={v} value={v}>{rotulo(v)}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const onb = onboardingQuery.data;

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
            onClick={() => { void cockpitQuery.refetch(); void canaisQuery.refetch(); void syncQuery.refetch(); void onboardingQuery.refetch(); }}
            disabled={cockpitQuery.isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", cockpitQuery.isFetching && "animate-spin")} />
            Atualizar
          </Button>
        }
      />

      {onb && !onb.seguro_desligar_bling && (
        <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Migração do controle: {formatNum(onb.com_razao)} de {formatNum(onb.skus_ativos)} SKUs controlados pelo SNCF — não desligar o estoque do Bling
        </p>
      )}

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

      {cockpitQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar o estoque: {formatError(cockpitQuery.error)}
        </div>
      )}
      {canaisQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar estoque por centro: {formatError(canaisQuery.error)}
        </div>
      )}
      {onboardingQuery.isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          Falha ao carregar o progresso da migração: {formatError(onboardingQuery.error)}
        </div>
      )}

      <section className="grid grid-cols-2 gap-2 md:grid-cols-5" aria-label="Indicadores do estoque">
        <CartaoNumero
          rotulo="Estoque total"
          valor={`${formatNum(cartoes.contabil)} un`}
          sub={`${formatBRL(cartoes.valor)} a custo · ${formatBRL(cartoes.valorVenda)} a venda`}
        />
        <CartaoNumero
          rotulo="Giro"
          valor={cartoes.giro == null ? "—" : `${cartoes.giro.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} x/ano`}
          sub={`${formatNum(cartoes.vendas)} un vendidas em ${formatNum(cartoes.janela)} dias`}
        />
        <CartaoNumero
          rotulo="Tempo de estoque"
          valor={cartoes.tempo == null ? "—" : `${formatNum(cartoes.tempo)} dias`}
          sub="de cobertura"
        />
        <CartaoNumero
          rotulo="Saúde"
          valor={cartoes.saude == null ? "—" : `${cartoes.saude.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
          sub="sem furo e com contagem em dia"
          alerta={cartoes.saude != null && cartoes.saude < 90 ? "warning" : null}
        />
        <CartaoNumero
          rotulo="Em trânsito"
          valor={`${formatNum(cartoes.emTransito)} un`}
          sub="un embarcadas"
        />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={visao}
          onValueChange={(v) => { if (!v) return; setVisao(v as Visao); setSort(SORT_PADRAO[v as Visao]); setPagina(1); }}
          className="rounded-md border bg-card p-0.5"
          aria-label="Visão da tabela"
        >
          <ToggleGroupItem value="estoque" size="sm" className="h-8 px-3 text-xs">Estoque</ToggleGroupItem>
          <ToggleGroupItem value="valor" size="sm" className="h-8 px-3 text-xs">Valor</ToggleGroupItem>
        </ToggleGroup>
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
          {filtroSelect(faseFiltro, setFaseFiltro, "Todas as fases", opcoes.fases, "w-[160px]")}
          {filtroSelect(colecaoFiltro, setColecaoFiltro, "Todas as coleções", opcoes.colecoes, "w-[180px]")}
          {filtroSelect(centroFiltro, setCentroFiltro, "Todos os centros", opcoes.centros, "w-[180px]")}
          {filtroSelect(situacaoFiltro, setSituacaoFiltro, "Todas as situações", opcoes.situacoes, "w-[170px]", rotuloStatusVenda)}
        </div>
      </div>

      {cockpitQuery.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Carregando…</div>
      ) : ordenados.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum produto neste recorte</p>
          <Button variant="link" onClick={limparFiltros}>Limpar filtros</Button>
        </div>
      ) : <div className="overflow-hidden rounded-md border bg-card" style={{ ["--fila-topo-colado" as string]: "0px" }}>
        <Table className="table-fixed text-[12px] [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3" containerClassName="max-h-[min(62vh,46rem)]">
          <TableHeader>
            <TableRow className={LINHA_CABECALHO_COLADO}>
              {/* Larguras: base compacta (cabe em 1280px com sidebar aberta) e
                  as larguras de referência a partir de 1440px. */}
              {cabecalho("cod", "Código", "w-[67px] min-[1440px]:w-[76px]")}
              {cabecalho("nome", "Produto", "")}
              {cabecalho("situacao", "Situação", "w-[96px] min-[1440px]:w-[108px]")}
              {cabecalho("saude", "Saúde", "w-[62px] text-center")}
              {visao === "estoque" && <>
                {cabecalho("contabil", "Contábil", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("fisico", "Físico", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("realxpm", "Real XPM", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("realsite", "Site SP", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("diverg", "Divergência", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("virtual", "Virtual", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho(
                  "tempo",
                  "Cobertura",
                  "w-[74px] min-[1440px]:w-[88px]",
                  true,
                  "Tempo de estoque em dias (virtual ÷ venda diária dos últimos 90 dias)",
                )}
                {cabecalho("transito", "Em trânsito", "w-[78px] min-[1440px]:w-[92px]", true)}
                {cabecalho("chegada", "Chegada", "w-[74px] min-[1440px]:w-[80px]", true)}
              </>}
              {visao === "valor" && <>
                {cabecalho("virtual", "Virtual", "w-[76px] min-[1440px]:w-[84px]", true)}
                {cabecalho("reservado", "Reservado", "w-[76px] min-[1440px]:w-[88px]", true)}
                {cabecalho("ticket", "Ticket médio", "w-[88px] min-[1440px]:w-[104px]", true)}
                {cabecalho("vcusto", "Valor custo", "w-[104px] min-[1440px]:w-[124px]", true)}
                {cabecalho("vvenda", "Valor venda", "w-[104px] min-[1440px]:w-[124px]", true)}
                {cabecalho("vemp", "Valor empenhado", "w-[104px] min-[1440px]:w-[132px]", true)}
              </>}
            </TableRow>
          </TableHeader>
          <TooltipProvider delayDuration={150}>
          <TableBody>
            {pageItems.map((p) => (
              <TableRow
                key={p.chave}
                className={cn(p.sku && "cursor-pointer")}
                onClick={() => p.sku && setDetalhe({ sku: p.sku, nome: p.nome_comercial })}
              >
                <TableCell className="truncate font-mono">
                  {p.cod_cadastro ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="leading-tight">
                  <div className="font-medium truncate" title={p.nome_comercial ?? ""}>{p.nome_comercial ?? "—"}</div>
                  {p.cor_nome && <div className="text-[11px] text-muted-foreground truncate">{p.cor_nome}</div>}
                </TableCell>
                <TableCell>
                  {p.situacao ? (
                    <Badge variant="outline" className={cn("font-normal", classeStatusVenda(p.situacao))}>
                      {rotuloStatusVenda(p.situacao)}
                    </Badge>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn("inline-block h-2 w-2 rounded-full", SAUDE_INFO[p.saude ?? ""]?.cor ?? "bg-muted-foreground/40")}
                        aria-label={SAUDE_INFO[p.saude ?? ""]?.texto ?? "Sem dado"}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{SAUDE_INFO[p.saude ?? ""]?.texto ?? "Sem dado"}</TooltipContent>
                  </Tooltip>
                </TableCell>
                {visao === "estoque" && <>
                  <TableCell className="text-right tabular-nums">{formatNum(p.contabil)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(p.fisico)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numOuTraco(p.real_xpm)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numOuTraco(p.real_site)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", p.divergencia !== 0 && "font-medium text-destructive")}>
                    {p.divergencia === 0 ? <span className="text-muted-foreground">—</span> : `${p.divergencia > 0 ? "+" : "−"}${formatNum(Math.abs(p.divergencia))}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatNum(p.virtual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{numOuTraco(p.tempo)}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.em_transito ? formatNum(p.em_transito) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={cn("tabular-nums text-right text-muted-foreground", p.eta_embarque && p.eta_embarque.slice(0, 10) < hoje && "text-warning")}>
                    {formatDataCurta(p.eta_embarque)}
                  </TableCell>
                </>}
                {visao === "valor" && <>
                  <TableCell className="text-right tabular-nums font-medium">{formatNum(p.virtual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNum(p.reservado)}</TableCell>
                  <TableCell
                    className={cn("text-right tabular-nums", p.fonte_ticket === "tabela" && "text-muted-foreground")}
                    title={p.fonte_ticket === "tabela" ? "sem venda em 90 dias — preço de atacado" : undefined}
                  >
                    {p.ticket == null ? "—" : formatBRL(p.ticket)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(p.valor_custo)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{formatBRL(p.valor_venda)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBRL(p.valor_empenhado)}</TableCell>
                </>}
              </TableRow>
            ))}
          </TableBody>
          </TooltipProvider>
        </Table>
        <RodapePaginacao
          total={ordenados.length}
          pagina={paginaAtual}
          tamanhoPagina={pageSize}
          tela="cockpit_estoque"
          onPagina={setPagina}
          onTamanhoPagina={setPageSize}
          extraDireita={<span className="text-sm text-muted-foreground tabular-nums">{formatNum(ordenados.length)} linhas · {formatNum(pageItems.length)} exibidas</span>}
        />
      </div>}

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
                  <dd className="font-mono">{detalheLinha.cod_cadastro ?? "—"}</dd>
                  <dt className="text-muted-foreground">SKU</dt>
                  <dd className="font-mono">{detalheLinha.sku ?? "—"}</dd>
                  <dt className="text-muted-foreground">Cor</dt>
                  <dd>{detalheLinha.cor_nome ?? "—"}</dd>
                  <dt className="text-muted-foreground">Reservado</dt>
                  <dd className="tabular-nums">{formatNum(detalheLinha.reservado)}</dd>
                  <dt className="text-muted-foreground">Valor a custo</dt>
                  <dd className="tabular-nums">{formatBRL(detalheLinha.valor_custo)}</dd>
                  <dt className="text-muted-foreground">Vendas na janela</dt>
                  <dd className="tabular-nums">{formatNum(detalheLinha.vendas_janela)} un em {formatNum(detalheLinha.janela_dias)} dias</dd>
                </dl>
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

function numOuTraco(v: number | null | undefined) {
  return v == null ? <span className="text-muted-foreground">—</span> : formatNum(v);
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
  rotulo, valor, sub, alerta = null,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  alerta?: "destructive" | "warning" | null;
}) {
  return (
    <div
      className={cn(
        "flex h-20 flex-col justify-center rounded-md border bg-card p-3",
        alerta === "destructive" && "border-l-[3px] border-l-destructive",
        alerta === "warning" && "border-l-[3px] border-l-warning",
      )}
    >
      <span className="truncate text-[11px] text-muted-foreground">{rotulo}</span>
      <span className="mt-1 text-[21px] font-medium tabular-nums text-foreground leading-tight">{valor}</span>
      {sub && <span className="truncate text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}
