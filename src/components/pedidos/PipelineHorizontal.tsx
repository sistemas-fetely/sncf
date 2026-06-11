import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIO_LABELS_CURTO, PIPELINE_PRINCIPAL } from "@/types/pedido";
import { ESTAGIO_CORES } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import {
  AlertTriangle, Inbox, Shield, CheckCircle2, Receipt,
  Clock, FileClock, Package, FileText, Truck, PackageCheck,
} from "lucide-react";

const ESTAGIO_ICONES: Record<EstagioPedido, JSX.Element> = {
  recebido:             <Inbox className="h-4 w-4" />,
  em_analise_credito:   <Shield className="h-4 w-4" />,
  
  cobranca:             <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_faturado:         <FileClock className="h-4 w-4" />,
  aguardando_estoque:   <Clock className="h-4 w-4" />,
  em_separacao:         <Package className="h-4 w-4" />,
  faturado:             <FileText className="h-4 w-4" />,
  em_transporte:        <Truck className="h-4 w-4" />,
  entregue:             <PackageCheck className="h-4 w-4" />,
  cancelado:            <AlertTriangle className="h-4 w-4" />,
  recuperacao_venda:    <AlertTriangle className="h-4 w-4" />,
};

// Fundo suave — tom claro da cor do estágio
const ESTAGIO_BG_SUAVE: Record<EstagioPedido, string> = {
  recebido:             "bg-slate-100 dark:bg-slate-800/40",
  em_analise_credito:   "bg-blue-50 dark:bg-blue-900/30",
  
  cobranca:             "bg-violet-50 dark:bg-violet-900/30",
  aguardando_pagamento: "bg-amber-50 dark:bg-amber-900/30",
  pre_faturado:         "bg-orange-50 dark:bg-orange-900/30",
  aguardando_estoque:   "bg-yellow-50 dark:bg-yellow-900/30",
  em_separacao:         "bg-sky-50 dark:bg-sky-900/30",
  faturado:             "bg-sky-100 dark:bg-sky-900/40",
  em_transporte:        "bg-indigo-50 dark:bg-indigo-900/30",
  entregue:             "bg-green-50 dark:bg-green-900/30",
  cancelado:            "bg-red-50 dark:bg-red-900/30",
  recuperacao_venda:    "bg-orange-50 dark:bg-orange-900/30",
};

// Cor do número e ícone — tom médio da cor do estágio
const ESTAGIO_TEXT_COR: Record<EstagioPedido, string> = {
  recebido:             "text-slate-600 dark:text-slate-400",
  em_analise_credito:   "text-blue-600 dark:text-blue-400",
  
  cobranca:             "text-violet-600 dark:text-violet-400",
  aguardando_pagamento: "text-amber-600 dark:text-amber-400",
  pre_faturado:         "text-orange-600 dark:text-orange-400",
  aguardando_estoque:   "text-yellow-700 dark:text-yellow-400",
  em_separacao:         "text-sky-600 dark:text-sky-400",
  faturado:             "text-sky-700 dark:text-sky-400",
  em_transporte:        "text-indigo-600 dark:text-indigo-400",
  entregue:             "text-green-600 dark:text-green-400",
  cancelado:            "text-red-600 dark:text-red-400",
  recuperacao_venda:    "text-orange-600 dark:text-orange-400",
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
  const totalQtd = estagios.reduce((acc, e) => acc + e.qtd, 0);
  const totalSla = estagios.reduce((acc, e) => acc + e.sla, 0);

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
              <span className={cn("text-lg font-semibold tabular-nums", textCor)}>
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
