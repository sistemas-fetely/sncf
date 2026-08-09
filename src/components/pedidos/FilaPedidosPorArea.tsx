import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { usePedidosFila } from "@/hooks/pedidos/usePedidosFila";
import { usePedidoRisco, usePedidoRiscoFaixas, RISCO_COR_TOKEN } from "@/hooks/pedidos/usePedidoRisco";
import { usePedidosEntregaLote } from "@/hooks/pedidos/usePedidoEntrega";
import { EntregaLinhaResumo, ESTAGIOS_COM_RESUMO_ENTREGA } from "@/components/pedidos/EntregaLinhaResumo";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageCircle, MoreHorizontal, FileSpreadsheet, Tag, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  classeSituacao,
  metaSituacao,
  rotuloSituacao,
} from "@/lib/pedidos/situacao-financeira";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { EnviarBlingDialog } from "@/components/pedidos/dialogs/EnviarBlingDialog";
import { ConfirmarPortaoPagoDialog } from "@/components/pedidos/dialogs/ConfirmarPortaoPagoDialog";
import { TabelaCadastroDialog } from "@/components/pedidos/dialogs/TabelaCadastroDialog";
import { ExportarPedidoDialog } from "@/components/pedidos/dialogs/ExportarPedidoDialog";
import { Button } from "@/components/ui/button";
import { BotaoSplitPedido } from "@/components/pedidos/BotaoSplitPedido";

import {
  EstagioBadge, FormatoIdade,
} from "./BadgesPedido";
import { MarcacaoPedido, MarcacaoBadge } from "./MarcacaoPedido";
import type { AreaPedido, EstagioPedido, PedidoFilaItem } from "@/types/pedido";


type OrdenacaoFila = "cronologico" | "risco";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 64; // px aprox (linha de 2 alturas de texto após a fusão de colunas)
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

interface Props {
  area: AreaPedido | "todas";
  estagioInicial?: EstagioPedido | "todos";
  /** Múltiplos estágios (vindos dos cards do pipeline) */
  estagios?: EstagioPedido[];
  apenasAtivos?: boolean;
  /** Espelha o toggle do pipeline: traz cancelados/recuperação para a fila. */
  incluirCancelados?: boolean;
  /** Espelha a tarja de risco alto do pipeline. */
  somenteRiscoAlto?: boolean;
}




export function FilaPedidosPorArea({
  area,
  estagioInicial = "todos",
  estagios,
  apenasAtivos = true,
  incluirCancelados = false,
  somenteRiscoAlto = false,
  
}: Props) {
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");
  const [estagioFilter] = useState<EstagioPedido | "todos">(estagioInicial);

  const [marcacaoFilter, setMarcacaoFilter] = useState<string>("todas");
  const [formaPgtoFilter, setFormaPgtoFilter] = useState<string>("todas");
  const [situacaoFilter, setSituacaoFilter] = useState<string>("todas");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFila>("risco");
  const [pagina, setPagina] = useState(1);
  const [pageSizeOpt, setPageSizeOpt] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [autoPageSize, setAutoPageSize] = useState<number>(20);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const pageSize = pageSizeOpt === "auto" ? autoPageSize : pageSizeOpt;
  const navigate = useNavigate();
  

  useLayoutEffect(() => {
    function recompute() {
      const el = tableWrapperRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - FOOTER_RESERVE;
      const rows = Math.max(3, Math.floor(available / ROW_HEIGHT));
      setAutoPageSize(rows);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 300);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    setPagina(1);
  }, [buscaDebounced, estagioFilter, marcacaoFilter, formaPgtoFilter, situacaoFilter, ordenacao, estagios, area]);

  const usarEstagiosMultiplos = !!(estagios && estagios.length > 0);




  // Quando um estágio específico é selecionado (ex: 'cancelado' ou 'entregue'),
  // desativa o filtro `apenasAtivos` que excluiria justamente esses estágios.
  const estagioEspecificoSelecionado =
    (usarEstagiosMultiplos && estagios && estagios.length > 0) ||
    (!usarEstagiosMultiplos && !!estagioFilter && estagioFilter !== "todos");

  const { data, isLoading, isError, error } = usePedidosFila({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    busca: buscaDebounced || undefined,
    apenasAtivos: apenasAtivos && !estagioEspecificoSelecionado,
    incluirCancelados,
  });

  // Farol de risco — fonte única: vw_pedido_risco + dimensão pedido_risco_faixa.
  const { data: riscoMap } = usePedidoRisco();
  const { data: faixas } = usePedidoRiscoFaixas();

  const termoBusca = buscaDebounced.trim();

  // Busca por nome fantasia: a busca da fila é server-side em razão social/CNPJ/nº,
  // então quem digita o apelido precisa desta perna extra — resolve os parceiros
  // pelo apelido em vw_parceiro_nome e traz os pedidos deles para o mesmo conjunto.
  const { data: pedidosPorApelido } = useQuery({
    queryKey: ["fila-por-apelido", termoBusca],
    enabled: termoBusca.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoFilaItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const t = termoBusca.replace(/[,()%]/g, " ").trim();
      const { data: nomes, error: nErr } = await sb
        .from("vw_parceiro_nome")
        .select("parceiro_id, apelido")
        .ilike("apelido", `%${t}%`)
        .limit(100);
      if (nErr) throw nErr;
      const ids = (nomes || [])
        .map((r: { parceiro_id: string }) => r.parceiro_id)
        .filter(Boolean);
      if (ids.length === 0) return [];
      const { data: rows, error } = await sb
        .from("v_pedidos_fila")
        .select("*")
        .in("parceiro_id", ids)
        .order("recebido_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (rows || []) as PedidoFilaItem[];
    },
  });

  // NOME-CANONICO-COM-APELIDO: v_pedidos_fila não traz apelido. Uma consulta
  // batelada em vw_parceiro_nome cobre a lista inteira (nunca por linha).
  const parceiroIdsLista = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.parceiro_id) set.add(p.parceiro_id); });
    (pedidosPorApelido || []).forEach((p) => { if (p.parceiro_id) set.add(p.parceiro_id); });
    return Array.from(set).sort();
  }, [data, pedidosPorApelido]);

  const { data: apelidoMap } = useQuery({
    queryKey: ["fila-apelidos", parceiroIdsLista],
    enabled: parceiroIdsLista.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string | null>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error } = await (supabase as any)
        .from("vw_parceiro_nome")
        .select("parceiro_id, apelido")
        .in("parceiro_id", parceiroIdsLista);
      if (error) throw error;
      const map: Record<string, string | null> = {};
      (rows || []).forEach((r: { parceiro_id: string; apelido: string | null }) => {
        map[r.parceiro_id] = r.apelido ?? null;
      });
      return map;
    },
  });


  const linhas = useMemo(() => {
    let base: PedidoFilaItem[] = data || [];
    if (termoBusca.length >= 2 && pedidosPorApelido && pedidosPorApelido.length > 0) {
      const vistos = new Set(base.map((p) => p.id));
      base = [...base, ...pedidosPorApelido.filter((p) => !vistos.has(p.id))];
    }
    if (marcacaoFilter === "sem") base = base.filter((p) => !p.marcacao);
    else if (marcacaoFilter === "com") base = base.filter((p) => !!p.marcacao);
    else if (marcacaoFilter !== "todas") base = base.filter((p) => p.marcacao === marcacaoFilter);
    if (formaPgtoFilter !== "todas") {
      base = base.filter((p) => (p.forma_solicitada || "").toLowerCase() === formaPgtoFilter);
    }
    if (situacaoFilter !== "todas") {
      base = base.filter((p) => {
        const s = p.situacao_financeira;
        if (situacaoFilter === "em_aberto") return s === "em_aberto" || s === "parcial_pago";
        return s === situacaoFilter;
      });
    }
    if (somenteRiscoAlto) {
      base = base.filter((p) => riscoMap?.get(p.id)?.risco_cor === "destructive");
    }
    if (ordenacao !== "risco") return base;
    return [...base].sort((a, b) => {
      const ra = riscoMap?.get(a.id);
      const rb = riscoMap?.get(b.id);
      const sa = ra?.risco_score ?? -1;
      const sb = rb?.risco_score ?? -1;
      if (sb !== sa) return sb - sa;
      const da = ra?.dias_na_fase ?? -1;
      const db = rb?.dias_na_fase ?? -1;
      if (db !== da) return db - da;
      return new Date(a.recebido_em).getTime() - new Date(b.recebido_em).getTime();
    });
  }, [data, pedidosPorApelido, termoBusca, ordenacao, riscoMap, marcacaoFilter, formaPgtoFilter, situacaoFilter, somenteRiscoAlto]);

  const buscaGlobalAtiva = !!buscaDebounced.trim() && !estagioEspecificoSelecionado;

  const resumoBuscaGlobal = useMemo(() => {
    if (!buscaGlobalAtiva) return null;
    let entregues = 0, cancelados = 0, recuperacao = 0;
    (linhas || []).forEach((p) => {
      if (p.estagio === "entregue") entregues++;
      else if (p.estagio === "cancelado") cancelados++;
      else if (p.estagio === "recuperacao_venda") recuperacao++;
    });
    return { entregues, cancelados, recuperacao, total: linhas?.length ?? 0 };
  }, [buscaGlobalAtiva, linhas]);






  const formasPgtoDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.forma_solicitada) set.add(p.forma_solicitada.toLowerCase()); });
    return Array.from(set).sort();
  }, [data]);

  const marcacoesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (data || []).forEach((p) => { if (p.marcacao) set.add(p.marcacao); });
    return Array.from(set).sort();
  }, [data]);

  // Estágio da análise de crédito por pedido (somente para pedidos em em_analise_credito)
  const pedidoIdsEmAnalise = useMemo(
    () => (linhas || []).filter((p) => p.estagio === "em_analise_credito").map((p) => p.id),
    [linhas]
  );
  const { data: analiseStages } = useQuery({
    queryKey: ["fila-analise-stages", pedidoIdsEmAnalise],
    enabled: pedidoIdsEmAnalise.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("analises_credito")
        .select("pedido_id, estagio_atual, criado_em")
        .in("pedido_id", pedidoIdsEmAnalise)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      const m = new Map<string, string>();
      (rows || []).forEach((r: { pedido_id: string; estagio_atual: string }) => {
        if (!m.has(r.pedido_id)) m.set(r.pedido_id, r.estagio_atual);
      });
      return m;
    },
  });

  // Info da remessa em aguardando_estoque (dias esperando, situação do recebível, falta)
  const pedidoIdsAguardando = useMemo(
    () => (linhas || []).filter((p) => p.estagio === "aguardando_estoque").map((p) => p.id),
    [linhas]
  );
  const { data: aguardandoEstoqueMap } = useQuery({
    // Prefixo "pedidos-fila" é intencional: invalidações existentes de ["pedidos-fila"]
    // ao liberar remessa no detalhe do pedido também revalidam este cache.
    queryKey: ["pedidos-fila", "aguardando-estoque", pedidoIdsAguardando],
    enabled: pedidoIdsAguardando.length > 0,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: rows, error } = await (supabase as any)
        .from("vw_pedido_aguardando_estoque")
        .select("pedido_id, dias_esperando, situacao_recebivel, situacao_codigo, falta_linha")
        .in("pedido_id", pedidoIdsAguardando);
      if (error) throw error;
      const m = new Map<
        string,
        {
          dias_esperando: number | null;
          situacao_recebivel: string | null;
          situacao_codigo: string | null;
          falta_linha: number | null;
        }
      >();
      (rows || []).forEach((r: any) => {
        m.set(r.pedido_id, {
          dias_esperando: r.dias_esperando,
          situacao_recebivel: r.situacao_recebivel,
          situacao_codigo: r.situacao_codigo,
          falta_linha: r.falta_linha,
        });
      });
      return m;
    },
  });

  // Resumo de saída (data de entrega, transportadora, NF) para pedidos já expedidos
  const pedidoIdsSaida = useMemo(
    () =>
      (linhas || [])
        .filter((p) => (ESTAGIOS_COM_RESUMO_ENTREGA as readonly string[]).includes(p.estagio))
        .map((p) => p.id),
    [linhas]
  );
  const {
    data: entregaMap,
    isError: entregaErro,
    error: entregaErrorObj,
  } = usePedidosEntregaLote(pedidoIdsSaida);



  const { data: msgPendentes } = useQuery({
    queryKey: ["canal-msgs-pendentes"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_eventos")
        .select("pedido_id, tipo_evento, criado_em")
        .in("tipo_evento", ["msg_comercial", "msg_sops"])
        .order("criado_em", { ascending: false });

      const lastEvento = new Map<string, string>();
      for (const row of (data ?? []) as any[]) {
        if (!lastEvento.has(row.pedido_id)) {
          lastEvento.set(row.pedido_id, row.tipo_evento as string);
        }
      }
      const pendentes = new Set<string>();
      for (const [pid, tipo] of lastEvento.entries()) {
        if (tipo === "msg_comercial") pendentes.add(pid);
      }
      return pendentes;
    },
    refetchInterval: 60_000,
  });
  const pedidosComMsg = msgPendentes ?? new Set<string>();

  const totalLinhas = linhas?.length ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalLinhas / pageSize));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const pageItems = (linhas || []).slice(
    (paginaAtual - 1) * pageSize,
    paginaAtual * pageSize,
  );
  const inicioRange = totalLinhas === 0 ? 0 : (paginaAtual - 1) * pageSize + 1;
  const fimRange = Math.min(paginaAtual * pageSize, totalLinhas);
  const pageRange = buildPageRange(paginaAtual, totalPaginas);

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        Erro ao carregar a fila: {(error as Error)?.message ?? "erro desconhecido"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, nome fantasia, CNPJ ou nº do pedido…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={formaPgtoFilter} onValueChange={setFormaPgtoFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Pagamento: Todos</SelectItem>
            <SelectItem value="boleto">Boleto</SelectItem>
            <SelectItem value="pix">PIX</SelectItem>
            <SelectItem value="cartao">Cartão</SelectItem>
            {formasPgtoDisponiveis
              .filter((f) => !["boleto", "pix", "cartao"].includes(f))
              .map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select value={situacaoFilter} onValueChange={setSituacaoFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Situação: Todas</SelectItem>
            <SelectItem value="quitado">Quitado</SelectItem>
            <SelectItem value="parcial_pago">Parcial pago</SelectItem>
            <SelectItem value="em_aberto">Em aberto</SelectItem>
            <SelectItem value="vencido">Vencido</SelectItem>
            <SelectItem value="previsto">Cobrança prevista</SelectItem>
            <SelectItem value="coberto_haver">Coberto por haver</SelectItem>
            <SelectItem value="recebivel_familia">Recebível na mãe</SelectItem>
            <SelectItem value="sem_cobranca">Sem cobrança</SelectItem>
            <SelectItem value="sem_recebivel">Sem recebível</SelectItem>
            <SelectItem value="anulado">Anulado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={marcacaoFilter} onValueChange={setMarcacaoFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Marcação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Marcação: Todas</SelectItem>
            <SelectItem value="sem">Sem marcação</SelectItem>
            <SelectItem value="com">Com marcação</SelectItem>
            {marcacoesDisponiveis.length > 0 && marcacoesDisponiveis.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as OrdenacaoFila)}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cronologico">Ordenar: Cronológico</SelectItem>
            <SelectItem value="risco">Ordenar: Risco</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {resumoBuscaGlobal && (() => {
        const grupos: string[] = [];
        if (resumoBuscaGlobal.entregues > 0)
          grupos.push(`${resumoBuscaGlobal.entregues} ${resumoBuscaGlobal.entregues === 1 ? "entregue" : "entregues"}`);
        if (resumoBuscaGlobal.cancelados > 0)
          grupos.push(`${resumoBuscaGlobal.cancelados} ${resumoBuscaGlobal.cancelados === 1 ? "cancelado" : "cancelados"}`);
        if (resumoBuscaGlobal.recuperacao > 0)
          grupos.push(`${resumoBuscaGlobal.recuperacao} em recuperação`);
        return (
          <p className="text-xs text-foreground bg-muted/50 rounded-md px-2 py-1 inline-block">
            Busca em todo o histórico · {resumoBuscaGlobal.total}{" "}
            {resumoBuscaGlobal.total === 1 ? "resultado" : "resultados"}
            {grupos.length > 0 && ` (${grupos.join(" · ")})`}
          </p>
        );
      })()}


      {(ordenacao === "risco" || somenteRiscoAlto) && (
        <p className="text-xs text-muted-foreground">
          {ordenacao === "risco" && "Ordenado por risco (maior primeiro). "}
          {somenteRiscoAlto && "Mostrando apenas pedidos em risco alto."}
        </p>
      )}

      <div ref={tableWrapperRef} className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[56px]">Risco</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead className="w-[180px]">Valor</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead className="w-[70px]">Idade</TableHead>
              <TableHead className="w-[56px] text-right text-[11px] font-normal text-muted-foreground">Ações</TableHead>

            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!linhas || linhas.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum pedido neste filtro.
                </TableCell>
              </TableRow>
            )}
            {pageItems.map((p) => {
              const risco = riscoMap?.get(p.id);
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/pedidos/${p.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <FarolRisco
                      faixa={risco?.risco_faixa ?? null}
                      cor={risco?.risco_cor ?? null}
                      score={risco?.risco_score ?? null}
                      motivos={risco?.risco_motivos ?? []}
                      rotuloFaixa={
                        risco?.risco_faixa ? faixas?.get(risco.risco_faixa)?.rotulo ?? null : null
                      }
                    />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {p.parceiro_id ? (
                      <button
                        type="button"
                        className="font-medium text-sm text-left hover:underline"
                        onClick={() => navigate(`/parceiros/${p.parceiro_id}`, { state: { from: "/pedidos" } })}
                      >
                        {p.parceiro_razao}
                      </button>
                    ) : (
                      <p className="font-medium text-sm">{p.parceiro_razao}</p>
                    )}
                    {p.parceiro_id && apelidoMap?.[p.parceiro_id] && (
                      <p className="text-xs text-muted-foreground truncate">
                        {apelidoMap[p.parceiro_id]}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground font-mono">
                      {p.id_externo}
                      {p.parceiro_cnpj ? ` · ${p.parceiro_cnpj}` : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    <ValorComPagamento p={p} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <EstagioBadge estagio={p.estagio} />
                      {p.estagio === "em_analise_credito" && analiseStages?.get(p.id) === "entrada" && (
                        <Badge className="bg-amber-500 text-white border-0 text-[10px]">
                          Aguardando liberação
                        </Badge>
                      )}
                      {p.estagio === "em_analise_credito" && analiseStages?.get(p.id) === "analise" && (
                        <Badge variant="secondary" className="text-[10px]">
                          Em análise
                        </Badge>
                      )}
                      {p.estagio === "aguardando_estoque" && (() => {
                        const info = aguardandoEstoqueMap?.get(p.id);
                        if (!info) return null;
                        const cod = info.situacao_codigo;
                        const cls =
                          cod === "faturada_quitada"
                            ? "bg-muted text-foreground border-0"
                            : cod === "faturada_a_receber"
                            ? "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200 border-0"
                            : cod === "faturada_com_diferenca" || cod === "sem_recebivel"
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border-0"
                            : cod === "natureza_sem_cobranca"
                            ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200 border-0"
                            : "bg-muted text-foreground border-0";
                        const dias = info.dias_esperando;
                        const falta = Number(info.falta_linha ?? 0);
                        return (
                          <>
                            {info.situacao_recebivel && (
                              <Badge className={cn(cls, "text-[10px] py-0 px-1.5")}>
                                {info.situacao_recebivel}
                              </Badge>
                            )}
                            {dias != null && (
                              <span className="text-[11px] text-muted-foreground">
                                esperando {dias}d
                              </span>
                            )}
                            {falta > 0.05 && (
                              <span className="text-[11px] text-muted-foreground">
                                · falta {fmtBRL.format(falta)}
                              </span>
                            )}
                          </>
                        );
                      })()}
                      <MarcacaoBadge marcacao={p.marcacao} />
                      {p.proxima_acao && (
                        <span className="text-[11px] text-muted-foreground">· {p.proxima_acao}</span>
                      )}
                    </div>
                    {(ESTAGIOS_COM_RESUMO_ENTREGA as readonly string[]).includes(p.estagio) &&
                      (entregaErro ? (
                        <p className="mt-1 text-[11px] text-destructive">
                          Erro ao carregar entrega/NF: {(entregaErrorObj as Error)?.message || "falha desconhecida"}
                        </p>
                      ) : (
                        <EntregaLinhaResumo info={entregaMap?.get(p.id)} />
                      ))}
                  </TableCell>

                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <FormatoIdade minutos={p.idade_minutos} />
                  </TableCell>

                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <AcoesLinha p={p} temMsg={pedidosComMsg.has(p.id)} />
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm bg-background border-t border-border shadow-[0_-2px_8px_-4px_hsl(var(--foreground)/0.1)]">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>
            {totalLinhas === 0
              ? "Nenhum resultado"
              : <>Mostrando <span className="font-medium text-foreground tabular-nums">{inicioRange}</span>–<span className="font-medium text-foreground tabular-nums">{fimRange}</span> de <span className="font-medium text-foreground tabular-nums">{totalLinhas}</span></>}
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
              <SelectTrigger className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
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

function ValorComPagamento({ p }: { p: PedidoFilaItem }) {
  const situacao = p.situacao_financeira;
  const rotulo = p.situacao_rotulo;
  const ref = p.pagamento_ref;
  const refNota = ref === "pai" ? " · informação do pedido pai" : "";
  const valorPago = Number(p.valor_pago || 0);
  const valorAberto = Number(p.valor_aberto || 0);
  const valorVencido = Number(p.valor_vencido || 0);
  const diasAtraso = Number(p.dias_atraso_max || 0);

  const valorLine = <p className="font-semibold">{fmtBRL.format(p.valor_liquido)}</p>;
  const condLine = (
    <p className="text-[11px] text-muted-foreground">
      {p.condicao_solicitada} · {p.forma_solicitada}
    </p>
  );

  if (situacao === "vencido") {
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-1.5">
          {valorLine}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Badge variant="destructive" className="text-[10px] py-0 px-1.5">
                    {rotulo || `Vencido ${diasAtraso}d`}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {fmtBRL.format(valorVencido)} vencido{refNota}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {condLine}
      </>
    );
  }

  if (situacao === "quitado") {
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-1.5">
          {valorLine}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  {/* Rótulo do banco ignorado de propósito: ele repete o valor exibido ao lado. */}
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[10px] py-0 px-1.5">
                    Quitado
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Pagamento quitado{refNota}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {condLine}
      </>
    );
  }

  if (situacao === "parcial_pago") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <div className="flex flex-wrap items-baseline gap-1.5">
                {valorLine}
                <span className="inline-block">
                  <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100 border-0 text-[10px] py-0 px-1.5">
                    {rotulo || "Parcial pago"}
                  </Badge>
                </span>
              </div>
              {condLine}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">
              {fmtBRL.format(valorPago)} pago · {fmtBRL.format(valorAberto)} em aberto{refNota}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // sem_recebivel = problema real (nada previsto, nada pago, nada na família).
  if (situacao === "sem_recebivel") {
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-1.5">
          {valorLine}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Badge className={cn(classeSituacao(situacao), "text-[10px] py-0 px-1.5")}>
                    Sem recebível
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">
                  {rotuloSituacao(situacao, p.lastro_porque, rotulo)} · falta faturar:{" "}
                  {fmtBRL.format(p.valor_liquido)}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {condLine}
      </>
    );
  }

  // Estados informativos — NÃO são alerta: natureza sem cobrança, plano previsto,
  // pré-pago por haver e recebível que vive na mãe do split. Texto vem do banco.
  if (
    situacao === "sem_cobranca" ||
    situacao === "previsto" ||
    situacao === "coberto_haver" ||
    situacao === "recebivel_familia" ||
    situacao === "anulado"
  ) {
    const texto = rotuloSituacao(situacao, rotulo, p.lastro_porque);
    const curto = metaSituacao(situacao)?.label ?? texto;
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-1.5">
          {valorLine}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-block">
                  <Badge className={cn(classeSituacao(situacao), "text-[10px] py-0 px-1.5")}>
                    {curto}
                  </Badge>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-[280px]">{texto}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {condLine}
      </>
    );
  }


  // em_aberto ou sem linha na view: valor limpo, sem badge.
  return (
    <>
      {valorLine}
      {condLine}
    </>
  );
}


/** Farol de risco — bolinha colorida + tooltip com faixa, score e motivos. */
function FarolRisco({
  faixa,
  cor,
  score,
  motivos,
  rotuloFaixa,
}: {
  faixa: string | null;
  cor: string | null;
  score: number | null;
  motivos: { codigo: string; rotulo: string; pontos: number }[];
  rotuloFaixa: string | null;
}) {
  // Terminal (cancelado / recuperacao_venda) vem sem faixa: nada é renderizado.
  if (!faixa) return null;
  const bg = RISCO_COR_TOKEN[cor ?? ""] ?? "bg-muted-foreground";
  const label = rotuloFaixa || faixa;
  const motivosOrdenados = [...motivos].sort((a, b) => b.pontos - a.pontos);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-1.5 cursor-help"
            aria-label={`Risco: ${label}`}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", bg)} />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {score ?? "—"}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-xs font-semibold">{label}{score != null ? ` · ${score}` : ""}</p>
          {motivosOrdenados.length > 0 ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {motivosOrdenados.map((m) => (
                <li key={m.codigo} className="flex justify-between gap-3">
                  <span className="opacity-80">{m.rotulo}</span>
                  <span className="font-mono">+{m.pontos}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs opacity-80">Sem motivos registrados.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Coluna de ações: uma ação primária por estágio + resto no menu "⋯". */
function AcoesLinha({ p, temMsg }: { p: PedidoFilaItem; temMsg: boolean }) {
  const navigate = useNavigate();
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [exportarOpen, setExportarOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [marcacaoOpen, setMarcacaoOpen] = useState(false);

  return (
    <div className="flex justify-end items-center gap-0.5">
      {/* Ação primária do estágio */}
      {p.estagio === "recebido" && (
        <TriarPedidoDialog
          pedido_id={p.id}
          perfil_credito={null}
          estagio_atual={p.estagio}
          forma_solicitada={p.forma_solicitada}
          triggerLabel="Triar"
          triggerVariant="ghost"
        />
      )}
      {p.estagio === "cobranca" && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Abrir cobrança"
          aria-label="Abrir cobrança"
          onClick={() =>
            navigate(`/recebimento/cobranca/${p.id}`, {
              state: { from: "/pedidos", fromLabel: "Fila de Pedidos" },
            })
          }
        >
          <ExternalLink className="h-4 w-4" />
        </Button>
      )}
      {p.estagio === "aguardando_pagamento" && (
        <ConfirmarPortaoPagoDialog pedido_id={p.id} variante="discreta" />
      )}
      {p.estagio === "pre_separacao" && !p.bling_id_destino && (
        <EnviarBlingDialog
          pedido_id={p.id}
          parceiro_id={p.parceiro_id}
          id_externo={p.id_externo}
          valor_liquido={p.valor_liquido}
          forma_solicitada={p.forma_solicitada}
          variante="discreta"
        />
      )}


      {/* Secundárias */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Mais ações">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => navigate(`/pedidos/${p.id}`)}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir pedido
          </DropdownMenuItem>
          {temMsg && (
            <DropdownMenuItem onSelect={() => navigate(`/pedidos/${p.id}`)}>
              <MessageCircle className="h-4 w-4 mr-2" />
              Mensagem pendente
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setMarcacaoOpen(true)}>
            <Tag className="h-4 w-4 mr-2" />
            Marcação
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCadastroOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Cadastro
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setExportarOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exportar pedido
          </DropdownMenuItem>
          <BotaoSplitPedido
            pedido_id={p.id}
            id_externo={p.id_externo}
            valor_liquido={p.valor_liquido}
            estagio={p.estagio}
            variante="menuitem"
            open={splitOpen}
            onOpenChange={setSplitOpen}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Diálogo de marcação controlado pelo menu — Dialog, não Popover:
          o DropdownMenu devolve o foco ao trigger ao fechar e derrubava o popover. */}
      <MarcacaoPedido
        pedidoId={p.id}
        marcacao={p.marcacao}
        hideTrigger
        open={marcacaoOpen}
        onOpenChange={setMarcacaoOpen}
      />


      {/* Diálogos ficam fora do menu — o conteúdo do menu desmonta ao fechar. */}
      <TabelaCadastroDialog
        pedido_id={p.id}
        id_externo={p.id_externo}
        parceiro_id={p.parceiro_id}
        parceiro_nome={p.parceiro_razao}
        open={cadastroOpen}
        onOpenChange={setCadastroOpen}
        hideTrigger
      />
      <ExportarPedidoDialog
        pedidoId={p.id}
        open={exportarOpen}
        onOpenChange={setExportarOpen}
        hideTrigger
      />
      <BotaoSplitPedido
        pedido_id={p.id}
        id_externo={p.id_externo}
        valor_liquido={p.valor_liquido}
        estagio={p.estagio}
        variante="dialogo"
        open={splitOpen}
        onOpenChange={setSplitOpen}
      />
    </div>
  );
}


