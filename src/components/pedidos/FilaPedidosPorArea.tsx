import { useState, useMemo } from "react";
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
import { Search, Send, Loader2, Sparkles, ExternalLink } from "lucide-react";
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
  const navigate = useNavigate();
  const enviarBling = useEnviarBling();

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

      <div className="rounded-md border border-border overflow-hidden">
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
            {linhas?.map((p) => {
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

                      {p.estagio === "pre_faturado" && (
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

      {linhas && linhas.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {linhas.length} pedido{linhas.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
