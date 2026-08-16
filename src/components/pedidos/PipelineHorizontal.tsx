import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIO_LABELS_CURTO, PIPELINE_PRINCIPAL } from "@/types/pedido";
import type { EstagioPedido } from "@/types/pedido";
import {
  AlertTriangle, Inbox, Shield, CheckCircle2, Receipt,
  Clock, FileClock, Package, PackageSearch, FileText, Truck, PackageCheck,
  PauseCircle,
} from "lucide-react";

const ESTAGIO_ICONES: Record<EstagioPedido, JSX.Element> = {
  recebido:             <Inbox className="h-4 w-4" />,
  em_analise_credito:   <Shield className="h-4 w-4" />,
  
  cobranca:             <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_separacao:        <FileClock className="h-4 w-4" />,
  pre_faturamento:      <PackageSearch className="h-4 w-4" />,
  aguardando_estoque:   <Clock className="h-4 w-4" />,
  em_separacao:         <Package className="h-4 w-4" />,
  faturado:             <FileText className="h-4 w-4" />,
  em_transporte:        <Truck className="h-4 w-4" />,
  entregue:             <PackageCheck className="h-4 w-4" />,
  cancelado:            <AlertTriangle className="h-4 w-4" />,
  recuperacao_venda:    <AlertTriangle className="h-4 w-4" />,
};

/**
 * A aparência do card nasce do dado: `tipo_sla` vem de `v_pedidos_pipeline`.
 * Em `espera_externa` o relógio não corre — nunca fica vermelho.
 */
function aparenciaCard(
  estagio: EstagioPedido,
  sla: number,
  tipoSla: string | null,
): { caixa: string; numero: string; espera: boolean; selo: boolean } {
  if (tipoSla === "espera_externa") {
    return {
      caixa: "bg-muted/40 border-border",
      numero: "text-muted-foreground",
      espera: true,
      selo: false,
    };
  }
  if (sla > 0) {
    return {
      caixa: "border-destructive/40 bg-destructive/5",
      numero: "text-destructive",
      espera: false,
      selo: tipoSla === "interno",
    };
  }
  if (estagio === "recebido") {
    return { caixa: "border-dashed border-border bg-card", numero: "text-foreground", espera: false, selo: false };
  }
  if (estagio === "entregue") {
    return { caixa: "border-success/40 bg-success/5", numero: "text-success", espera: false, selo: false };
  }
  if (estagio === "cancelado" || estagio === "recuperacao_venda") {
    return { caixa: "border-destructive/40 bg-card", numero: "text-muted-foreground", espera: false, selo: false };
  }
  return { caixa: "border-border bg-card", numero: "text-foreground", espera: false, selo: false };
}

interface Props {
  onClickEstagio?: (estagio: EstagioPedido) => void;
  onLimparFiltro?: () => void;
  estagioAtivo?: EstagioPedido | null;
  incluirCancelados?: boolean;
  onToggleCancelados?: (v: boolean) => void;
  riscoAltoAtivo?: boolean;
  onToggleRiscoAlto?: () => void;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function PipelineHorizontal({
  onClickEstagio,
  onLimparFiltro,
  estagioAtivo,
  incluirCancelados = false,
  onToggleCancelados,
  riscoAltoAtivo = false,
  onToggleRiscoAlto,
}: Props) {
  const { data, isLoading, isError, error } = usePedidosPipeline();

  const { data: pagamentoVencido } = useQuery({
    queryKey: ["pedidos-pagamento-vencido-count"],
    staleTime: 30 * 1000,
    queryFn: async () => {
      // Fonte única do estado financeiro: vw_pedido_situacao_financeira
      // (derivada só de titulo_a_receber). Não usar pedido_portao para isto.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_situacao_financeira")
        .select("estagio")
        .eq("situacao_financeira", "vencido")
        .neq("estagio", "cancelado");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ estagio: string }>;
      let ativos = 0;
      let entregues = 0;
      for (const r of rows) {
        if (r.estagio === "entregue") entregues += 1;
        else ativos += 1;
      }
      return { ativos, entregues };
    },
  });

  const estagios = useMemo(() => {
    const map = new Map<EstagioPedido, { qtd: number; sla: number; tipo_sla: string | null }>();
    PIPELINE_PRINCIPAL.forEach((e) => map.set(e, { qtd: 0, sla: 0, tipo_sla: null }));
    (data || []).forEach((row) => {
      const atual = map.get(row.estagio as EstagioPedido);
      if (!atual) return;
      atual.qtd += row.qtd;
      atual.sla += row.qtd_sla_estourado;
      atual.tipo_sla = atual.tipo_sla ?? row.tipo_sla ?? null;
    });
    return PIPELINE_PRINCIPAL.map((estagio) => ({
      estagio,
      ...(map.get(estagio) || { qtd: 0, sla: 0, tipo_sla: null }),
    }));
  }, [data]);

  const fases = estagios.filter(
    (e) => !["cancelado", "recuperacao_venda"].includes(e.estagio)
  );

  // Universo do card "Todos" = exatamente o que a tabela mostra por padrão:
  // ativos (sem entregue) + cancelados/recuperação apenas com o toggle ligado.
  const { totalQtd, totalSla, riscoVermelhoQtd, riscoVermelhoValor } = useMemo(() => {
    const excluidosSempre = new Set<string>(["entregue"]);
    const naoAtivos = new Set<string>(["cancelado", "recuperacao_venda"]);
    let qtd = 0;
    let sla = 0;
    let rQtd = 0;
    let rValor = 0;
    (data || []).forEach((row) => {
      const e = row.estagio as string;
      if (excluidosSempre.has(e)) return;
      if (naoAtivos.has(e) && !incluirCancelados) return;
      qtd += Number(row.qtd || 0);
      sla += Number(row.qtd_sla_estourado || 0);
      rQtd += Number(row.qtd_risco_vermelho || 0);
      rValor += Number(row.valor_risco_vermelho || 0);
    });
    return { totalQtd: qtd, totalSla: sla, riscoVermelhoQtd: rQtd, riscoVermelhoValor: rValor };
  }, [data, incluirCancelados]);


  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Erro ao carregar o pipeline: {(error as Error)?.message ?? "erro desconhecido"}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 11 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(riscoVermelhoQtd > 0 || totalSla > 0 || (pagamentoVencido?.ativos ?? 0) > 0 || (pagamentoVencido?.entregues ?? 0) > 0) && (
        <div className="flex items-center gap-4 text-xs flex-wrap">
          {riscoVermelhoQtd > 0 && (
            <button
              type="button"
              onClick={() => onToggleRiscoAlto?.()}
              aria-pressed={riscoAltoAtivo}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-0.5 font-medium transition-colors",
                riscoAltoAtivo
                  ? "bg-destructive text-destructive-foreground ring-1 ring-destructive"
                  : "bg-destructive/10 text-destructive ring-1 ring-destructive/30 hover:bg-destructive/20"
              )}
              title={riscoAltoAtivo ? "Clique para limpar o filtro de risco alto" : "Filtrar somente risco alto"}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {riscoVermelhoQtd} em risco alto · {fmtBRL.format(riscoVermelhoValor)}
            </button>
          )}
          {totalSla > 0 && (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {totalSla} com SLA estourado
            </div>
          )}
          {(pagamentoVencido?.ativos ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pagamentoVencido!.ativos} com pagamento vencido
            </div>
          )}
          {(pagamentoVencido?.entregues ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-0.5 text-destructive font-medium ring-1 ring-destructive/30">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pagamentoVencido!.entregues} entregues sem pagamento
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {/* Botão Todos */}
        <button
          type="button"
          onClick={() => onLimparFiltro?.()}
          title="Pedidos em andamento. Não inclui entregues. Cancelados e recuperação de venda entram só com o toggle ao lado. Para ver histórico completo, use a busca."
          className={cn(
            "group relative flex flex-col items-center justify-center rounded-md border py-2 px-3 transition-all duration-200 min-w-[76px]",
            "gold-border-hover focus-visible:outline-none",
            !estagioAtivo ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card"
          )}
        >
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Fila ativa
          </span>
          <span className="text-lg font-medium tabular-nums">
            {totalQtd}
          </span>
        </button>

        {/* Toggle: incluir cancelados */}
        <button
          type="button"
          onClick={() => onToggleCancelados?.(!incluirCancelados)}
          aria-pressed={incluirCancelados}
          className={cn(
            "flex flex-col items-center justify-center rounded-md border py-2 px-3 transition-all duration-200 min-w-[92px] text-center",
            "gold-border-hover focus-visible:outline-none",
            incluirCancelados ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card"
          )}
          title="Inclui cancelados e recuperação de venda na fila"
        >
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">
            Incluir<br />cancelados
          </span>
          <span className="text-[11px] font-medium">
            {incluirCancelados ? "Ligado" : "Desligado"}
          </span>
        </button>


        {/* Cards por fase */}
        {fases.map(({ estagio, qtd, sla }) => {
          const isAtivo = estagioAtivo === estagio;
          const temPedidos = qtd > 0;
          const bgSuave = ESTAGIO_BG_SUAVE[estagio] || "bg-card";
          const textCor = ESTAGIO_TEXT_COR[estagio] || "text-foreground";

          return (
            <button
              key={estagio}
              type="button"
              onClick={() => onClickEstagio?.(estagio)}
              title={`${ESTAGIO_LABELS_CURTO[estagio]}: ${qtd} pedido${qtd !== 1 ? "s" : ""}`}
              className={cn(
                "group relative flex-1 flex flex-col items-center justify-center rounded-md border py-2 px-1 transition-all duration-200 min-w-0",
                "gold-border-hover focus-visible:outline-none",
                isAtivo
                  ? "gold-border bg-gold-soft shadow-sm"
                  : temPedidos
                  ? `${bgSuave} border-transparent`
                  : `${bgSuave} border-transparent opacity-40`
              )}
            >
              {/* Borda superior colorida */}
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 h-0.5 rounded-t-md",
                  ESTAGIO_CORES[estagio]
                )}
              />

              {/* Ícone */}
              <span className={cn("mb-0.5", textCor)}>
                {ESTAGIO_ICONES[estagio]}
              </span>

              {/* Label */}
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate max-w-full">
                {ESTAGIO_LABELS_CURTO[estagio]}
              </span>

              {/* Número */}
              <span className={cn("text-lg font-medium tabular-nums", textCor)}>
                {qtd}
              </span>

              {/* SLA */}
              {sla > 0 && (
                <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 text-destructive text-[10px] font-medium px-1.5 py-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {sla}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
