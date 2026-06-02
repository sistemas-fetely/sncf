import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIO_LABELS_CURTO, PIPELINE_PRINCIPAL } from "@/types/pedido";
import type { EstagioPedido } from "@/types/pedido";
import {
  AlertTriangle, Inbox, Shield, CheckCircle2, Receipt,
  Clock, FileClock, Package, FileText, Truck, PackageCheck,
} from "lucide-react";

const ESTAGIO_ICONES: Record<EstagioPedido, JSX.Element> = {
  recebido:             <Inbox className="h-4 w-4" />,
  em_analise_credito:   <Shield className="h-4 w-4" />,
  credito_aprovado:     <CheckCircle2 className="h-4 w-4" />,
  cobranca:             <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_faturado:         <FileClock className="h-4 w-4" />,
  em_separacao:         <Package className="h-4 w-4" />,
  faturado:             <FileText className="h-4 w-4" />,
  em_transporte:        <Truck className="h-4 w-4" />,
  entregue:             <PackageCheck className="h-4 w-4" />,
  cancelado:            <AlertTriangle className="h-4 w-4" />,
  recuperacao_venda:    <AlertTriangle className="h-4 w-4" />,
};

interface Props {
  onClickEstagio?: (estagio: EstagioPedido) => void;
  onLimparFiltro?: () => void;
  estagioAtivo?: EstagioPedido | null;
}

export function PipelineHorizontal({ onClickEstagio, onLimparFiltro, estagioAtivo }: Props) {
  const { data, isLoading } = usePedidosPipeline();

  const estagios = useMemo(() => {
    const map = new Map<EstagioPedido, { qtd: number; sla: number }>();
    PIPELINE_PRINCIPAL.forEach((e) => map.set(e, { qtd: 0, sla: 0 }));
    (data || []).forEach((row) => {
      const atual = map.get(row.estagio as EstagioPedido);
      if (!atual) return;
      atual.qtd += row.qtd;
      atual.sla += row.qtd_sla_estourado;
    });
    return PIPELINE_PRINCIPAL.map((estagio) => ({
      estagio,
      ...(map.get(estagio) || { qtd: 0, sla: 0 }),
    }));
  }, [data]);

  const fases = estagios.filter(
    (e) => !["entregue", "cancelado", "recuperacao_venda"].includes(e.estagio)
  );

  const totalSla = estagios.reduce((acc, e) => acc + e.sla, 0);
  const totalQtd = estagios.reduce((acc, e) => acc + e.qtd, 0);

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
      {totalSla > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" />
          {totalSla} com SLA estourado
        </div>
      )}
      <div className="flex gap-2">
        {/* Botão Todos */}
        <button
          type="button"
          onClick={() => onLimparFiltro?.()}
          className={cn(
            "group relative flex flex-col items-center justify-center rounded-md border py-2 px-3 transition-all duration-200 min-w-[64px]",
            "gold-border-hover focus-visible:outline-none",
            !estagioAtivo ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card"
          )}
        >
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Todos
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {totalQtd}
          </span>
        </button>

        {/* Cards por fase */}
        {fases.map(({ estagio, qtd, sla }) => {
          const isAtivo = estagioAtivo === estagio;
          const temPedidos = qtd > 0;
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
                  ? "border-border bg-card"
                  : "border-border bg-card opacity-40"
              )}
            >
              <span className="text-muted-foreground">
                {ESTAGIO_ICONES[estagio]}
              </span>
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate max-w-full">
                {ESTAGIO_LABELS_CURTO[estagio]}
              </span>
              <span className="text-lg font-semibold tabular-nums">
                {qtd}
              </span>
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
