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
import { Search, Send, Loader2, Sparkles, ExternalLink, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TriarPedidoDialog } from "@/components/pedidos/dialogs/TriarPedidoDialog";
import { ConfirmarPagamentoDialog } from "@/components/pedidos/dialogs/ConfirmarPagamentoDialog";
import { Button } from "@/components/ui/button";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
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
  const [ordenacao, setOrdenacao] = useState<OrdenacaoFila>("cronologico");
  const [pagina, setPagina] = useState(1);
  const [pageSizeOpt, setPageSizeOpt] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [autoPageSize, setAutoPageSize] = useState<number>(20);
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);
  const pageSize = pageSizeOpt === "auto" ? autoPageSize : pageSizeOpt;
  const navigate = useNavigate();
  const enviarBling = useEnviarBling();

  useLayoutEffect(() => {
    function recompute() {
      const el = tableWrapperRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const available = window.innerHeight - top - FOOTER_RESERVE;
      const rows = Math.max(3, Math.floor((available - 48) / ROW_HEIGHT) - 1);
      setAutoPageSize(rows);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busca, estagioFilter, marcacaoFilter, ordenacao, estagios, area]);

  const usarEstagiosMultiplos = !!(estagios && estagios.length > 0);

  const estagiosDoSelect = useMemo(() => {
    const completo = todosOsEstagios();
    if (area === "todas") return completo;
    return completo.filter((e) => ESTAGIO_AREA[e] === area);
  }, [area]);

  const { data, isLoading } = usePedidosFila({
    area,
    estagio: usarEstagiosMultiplos ? undefined : estagioFilter,
    estagios: usarEstagiosMultiplos ? estagios : undefined,
    busca: busca || undefined,
    apenasAtivos,
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
    if (ordenacao !== "prioridade_ia") return base;
    return [...base].sort((a, b) => {
      const sa = scoreMap.get(a.id)?.score ?? -1;
      const sb = scoreMap.get(b.id)?.score ?? -1;
      if (sb !== sa) return sb - sa;
      return new Date(a.recebido_em).getTime() - new Date(b.recebido_em).getTime();
    });
  }, [data, ordenacao, scoreMap, marcacaoFilter]);

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
            placeholder="Buscar por cliente, CNPJ ou ID externo…"
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
                    <p className="font-semibold">{fmtBRL.format(p.valor_liquido)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.condicao_solicitada} · {p.forma_solicitada}
                    </p>
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
                      <MarcacaoPedido pedidoId={p.id} marcacao={p.marcacao} iconOnly />

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
                          onClick={() => navigate(`/recebimento/cobranca/${p.id}`)}
                        >
                          <ExternalLink className="h-3 w-3 mr-1" />
                          Cobrança
                        </Button>
                      )}

                      {p.estagio === "aguardando_pagamento" && (
                        <ConfirmarPagamentoDialog
                          pedido_id={p.id}
                          valor_pedido={p.valor_liquido}
                        />
                      )}

                      {p.estagio === "pre_faturado" && !p.bling_id_destino && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={enviarBling.isPending && enviarBling.variables === p.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            enviarBling.mutate(p.id);
                          }}
                        >
                          {enviarBling.isPending && enviarBling.variables === p.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Enviando…
                            </>
                          ) : (
                            <>
                              <Send className="h-3 w-3 mr-1" />
                              Enviar Bling
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm bg-background border-t border-border">
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
