import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIO_LABELS_CURTO, PIPELINE_PRINCIPAL } from "@/types/pedido";
import { ESTAGIO_CORES } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import { AlertTriangle } from "lucide-react";

interface Props {
  onClickEstagio?: (estagio: EstagioPedido) => void;
  estagioAtivo?: EstagioPedido | null;
}

export function PipelineHorizontal({ onClickEstagio, estagioAtivo }: Props) {
  const { data, isLoading } = usePedidosPipeline();

  const estagios = useMemo(() => {
    const map = new Map<EstagioPedido, { qtd: number; valor: number; sla: number }>();
    PIPELINE_PRINCIPAL.forEach((e) => map.set(e, { qtd: 0, valor: 0, sla: 0 }));
    (data || []).forEach((row) => {
      const atual = map.get(row.estagio as EstagioPedido);
      if (!atual) return;
      atual.qtd += row.qtd;
      atual.valor += Number(row.soma_valor || 0);
      atual.sla += row.qtd_sla_estourado;
    });
    return PIPELINE_PRINCIPAL.map((estagio) => ({
      estagio,
      ...(map.get(estagio) || { qtd: 0, valor: 0, sla: 0 }),
    }));
  }, [data]);

  const fases = estagios.filter(
    (e) => !["entregue", "cancelado", "recuperacao_venda"].includes(e.estagio)
  );

  const totalSla = estagios.reduce((acc, e) => acc + e.sla, 0);

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1 rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* SLA estourado */}
      {totalSla > 0 && (
        <div className="flex items-center justify-end gap-1 text-xs text-red-600 font-medium">
          <AlertTriangle className="h-3.5 w-3.5" />
          {totalSla} com SLA estourado
        </div>
      )}

      {/* Pipeline horizontal */}
      <div className="flex gap-2">
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
                  : "border-border bg-card opacity-50"
              )}
            >
              {/* Borda superior colorida */}
              <div
                className={cn(
                  "absolute top-0 left-0 right-0 h-1 rounded-t-md",
                  ESTAGIO_CORES[estagio]
                )}
              />

              {/* Label */}
              <span className="text-[10px] text-muted-foreground font-medium truncate max-w-full leading-tight">
                {ESTAGIO_LABELS_CURTO[estagio]}
              </span>

              {/* Número */}
              <span
                className={cn(
                  "text-lg font-display font-semibold leading-tight mt-0.5",
                  isAtivo ? "text-[hsl(var(--gold))]" : "text-foreground"
                )}
              >
                {qtd}
              </span>

              {/* SLA */}
              {sla > 0 && (
                <span className="inline-flex items-center gap-0.5 rounded bg-red-50 px-1 py-px text-[10px] font-medium text-red-600 dark:bg-red-950/40 mt-0.5">
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
