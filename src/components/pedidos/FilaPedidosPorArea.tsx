import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { usePedidosFila } from "@/hooks/pedidos/usePedidosFila";
import {
  useFilaPedidosPriorizada,
  type OrdenacaoFila,
} from "@/hooks/pedidos/useFilaPedidosPriorizada";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Sparkles, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { EnviarBlingDialog } from "@/components/pedidos/dialogs/EnviarBlingDialog";
import { ConfirmarPortaoPagoDialog } from "@/components/pedidos/dialogs/ConfirmarPortaoPagoDialog";
import { TabelaCadastroDialog } from "@/components/pedidos/dialogs/TabelaCadastroDialog";
import { Button } from "@/components/ui/button";

import {
  EstagioBadge, FormatoIdade,
} from "./BadgesPedido";
import { BadgePriorizacao } from "./BadgePriorizacao";
import { MarcacaoPedido, MarcacaoBadge } from "./MarcacaoPedido";
import {
  ESTAGIO_LABELS, ESTAGIO_AREA, PIPELINE_PRINCIPAL,
  ESTAGIOS_TERMINAIS, ESTAGIOS_RECUPERAVEIS,
} from "@/types/pedido";
import type { AreaPedido, EstagioPedido, PedidoFilaItem, ScoreBreakdown } from "@/types/pedido";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAGE_SIZE_OPTIONS = ["auto", 50, 100, 200, 500] as const;
type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
const DEFAULT_PAGE_SIZE: PageSizeOption = "auto";
const ROW_HEIGHT = 80; // px aprox (linhas com 2 linhas de texto)
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
  /** Múltiplos estágios — quando preenchido, esconde o Select interno */
  estagios?: EstagioPedido[];
  apenasAtivos?: boolean;
}

/** Lista completa de estágios pra Select (pipeline + cancelado + recuperação). */
function todosOsEstagios(): EstagioPedido[] {
  return [
    ...PIPELINE_PRINCIPAL,
    ...ESTAGIOS_RECUPERAVEIS,
    ...ESTAGIOS_TERMINAIS.filter((e) => !PIPELINE_PRINCIPAL.includes(e)),
  ];
}

export function FilaPedidosPorArea({
  area,
  estagioInicial = "todos",
  estagios,
  apenasAtivos = true,
}: Props) {
  const [busca, setBusca] = useState("");
  const [estagioFilter, setEstagioFilter] = useState<EstagioPedido | "todos">(estagioInicial);
  const [marcacaoFilter, setMarcacaoFilter] = useState<string>("todas");
  const [formaPgtoFilter, setFormaPgtoFilter] = useState<string>("todas");
  const [situacaoFilter, setSituacaoFilter] = useState<string>("todas");
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFila>("cronologico");
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
    setPagina(1);
  }, [busca, estagioFilter, marcacaoFilter, formaPgtoFilter, situacaoFilter, ordenacao, estagios, area]);

  const usarEstagiosMultiplos = !!(estagios && estagios.length > 0);

  const estagiosDoSelect = useMemo(() => {
    const completo = todosOsEstagios();
    if (area === "todas") return completo;
    return completo.filter((e) => ESTAGIO_AREA[e] === area);
  }, [area]);

  // Quando um estágio específico é selecionado (ex: 'cancelado' ou 'entregue'),
  // desativa o filtro `apenasAtivos` que excluiria justamente esses estágios.
  const estagioEspecificoSelecionado =
    (usarEstagiosMultiplos && estagios && estagios.length > 0) ||
    (!usarEstagiosMultiplos && !!estagioFilter && estagioFilter !== "todos");

  const { data, isLoading } = usePedidosFila({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    busca: busca || undefined,
    apenasAtivos: apenasAtivos && !estagioEspecificoSelecionado,
  });

  // Scores IA — fetch paralelo, merge por id.
  const { data: priorizados } = useFilaPedidosPriorizada({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    ordenacao,
  });

  const scoreMap = useMemo(() => {
    const m = new Map<string, { score: number; breakdown: ScoreBreakdown }>();
    (priorizados || []).forEach((p) => {
      m.set(p.id, { score: p.score_total, breakdown: p.score_breakdown });
    });
    return m;
  }, [priorizados]);

  const linhas = useMemo(() => {
    let base: PedidoFilaItem[] = data || [];
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
    if (ordenacao !== "prioridade_ia") return base;
    return [...base].sort((a, b) => {
      const sa = scoreMap.get(a.id)?.score ?? -1;
      const sb = scoreMap.get(b.id)?.score ?? -1;
      if (sb !== sa) return sb - sa;
      return new Date(a.recebido_em).getTime() - new Date(b.recebido_em).getTime();
    });
  }, [data, ordenacao, scoreMap, marcacaoFilter, formaPgtoFilter, situacaoFilter]);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, CNPJ ou nº do pedido…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        {!usarEstagiosMultiplos && (
          <Select
            value={estagioFilter}
            onValueChange={(v) => setEstagioFilter(v as EstagioPedido | "todos")}
          >
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estágios</SelectItem>
              {estagiosDoSelect.map((e) => (
                <SelectItem key={e} value={e}>{ESTAGIO_LABELS[e]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
            <SelectItem value="prioridade_ia">Ordenar: Prioridade IA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {ordenacao === "prioridade_ia" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Ordenado por score IA (maior primeiro)
        </p>
      )}

      <div ref={tableWrapperRef} className="rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Score</TableHead>
              <TableHead>ID Externo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Estágio</TableHead>
              <TableHead>Idade</TableHead>
              <TableHead>Próxima ação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (!linhas || linhas.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum pedido neste filtro.
                </TableCell>
              </TableRow>
            )}
            {pageItems.map((p) => {
              const sc = scoreMap.get(p.id);
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/pedidos/${p.id}`)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {sc ? (
                      <BadgePriorizacao
                        score={sc.score}
                        breakdown={sc.breakdown}
                        compact
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{p.id_externo}</span>
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm">{p.parceiro_razao}</p>
                    <p className="text-[11px] text-muted-foreground font-mono">{p.parceiro_cnpj}</p>
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
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <FormatoIdade minutos={p.idade_minutos} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.proxima_acao || <span className="opacity-50">—</span>}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      {pedidosComMsg.has(p.id) && (
                        <button
                          onClick={() => navigate(`/pedidos/${p.id}`)}
                          title="Mensagem do Comercial aguardando resposta"
                          className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300 text-xs"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          <span className="font-medium">msg</span>
                        </button>
                      )}
                      <MarcacaoPedido pedidoId={p.id} marcacao={p.marcacao} iconOnly />

                      <TabelaCadastroDialog
                        pedido_id={p.id}
                        id_externo={p.id_externo}
                        parceiro_id={p.parceiro_id}
                        parceiro_nome={p.parceiro_razao}
                      />



                      {p.estagio === "recebido" && (
                        <TriarPedidoDialog
                          pedido_id={p.id}
                          perfil_credito={null}
                          estagio_atual={p.estagio}
                          forma_solicitada={p.forma_solicitada}
                          triggerLabel="Triar"
                          triggerVariant="outline"
                        />
                      )}

                      {p.estagio === "cobranca" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/recebimento/cobranca/${p.id}`, { state: { from: "/pedidos", fromLabel: "Fila de Pedidos" } })}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Cobrança
                        </Button>
                      )}

                      {p.estagio === "aguardando_pagamento" && (
                        <ConfirmarPortaoPagoDialog
                          pedido_id={p.id}
                        />
                      )}

                      {p.estagio === "pre_separacao" && !p.bling_id_destino && (
                        <EnviarBlingDialog
                          pedido_id={p.id}
                          parceiro_id={p.parceiro_id}
                          id_externo={p.id_externo}
                          valor_liquido={p.valor_liquido}
                          forma_solicitada={p.forma_solicitada}
                        />
                      )}
                    </div>
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
        {valorLine}
        {condLine}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block mt-1">
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
      </>
    );
  }

  if (situacao === "quitado") {
    return (
      <>
        {valorLine}
        {condLine}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block mt-1">
                <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[10px] py-0 px-1.5">
                  {rotulo || "Quitado"}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">Pagamento quitado{refNota}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    );
  }

  if (situacao === "parcial_pago") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              {valorLine}
              {condLine}
              <span className="inline-block mt-1">
                <Badge className="bg-sky-100 text-sky-900 hover:bg-sky-100 border-0 text-[10px] py-0 px-1.5">
                  {rotulo || "Parcial pago"}
                </Badge>
              </span>
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

  if (situacao === "sem_recebivel") {
    return (
      <>
        {valorLine}
        {condLine}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block mt-1">
                <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100 border-0 text-[10px] py-0 px-1.5">
                  {rotulo || "Sem recebível"}
                </Badge>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Pedido sem título a receber próprio · falta faturar: {fmtBRL.format(p.valor_liquido)}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </>
    );
  }

  if (situacao === "anulado") {
    return (
      <>
        {valorLine}
        {condLine}
        <span className="inline-block mt-1">
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
            {rotulo || "Anulado"}
          </Badge>
        </span>
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

