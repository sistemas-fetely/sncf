import { Check, AlertTriangle, RotateCcw } from "lucide-react";
import {
  PIPELINE_PRINCIPAL,
  ESTAGIO_LABELS,
} from "@/types/pedido";
import { ESTAGIO_CORES } from "@/components/pedidos/BadgesPedido";
import { cn } from "@/lib/utils";
import type { EstagioPedido } from "@/types/pedido";

interface Props {
  estagioAtual: EstagioPedido;
}

export function PedidoStepper({ estagioAtual }: Props) {
  const foraDoPipeline =
    estagioAtual === "cancelado" || estagioAtual === "recuperacao_venda";

  const estagios = PIPELINE_PRINCIPAL;
  const idxAtual = foraDoPipeline
    ? -1
    : estagios.indexOf(estagioAtual);

  return (
    <div className="space-y-2">
      {foraDoPipeline && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
            estagioAtual === "cancelado"
              ? "bg-destructive/10 text-destructive border border-destructive/30"
              : "bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/30"
          )}
        >
          {estagioAtual === "cancelado" ? (
            <>
              <AlertTriangle className="h-4 w-4" />
              Pedido cancelado
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" />
              Em recuperação de venda
            </>
          )}
        </div>
      )}

      {/* Desktop */}
      <div className="hidden sm:flex items-start w-full">
        {estagios.map((e, i) => {
          const completo = !foraDoPipeline && i < idxAtual;
          const atual = !foraDoPipeline && i === idxAtual;
          const cor = ESTAGIO_CORES[e];
          return (
            <div key={e} className="flex-1 flex flex-col items-center min-w-0">
              <div className="flex items-center w-full">
                <div
                  className={cn(
                    "flex-1 h-0.5",
                    i === 0 && "invisible",
                    completo || atual ? "bg-emerald-500" : "bg-border"
                  )}
                />
                <div
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 border-2",
                    foraDoPipeline
                      ? "bg-transparent border-border text-muted-foreground"
                      : completo || atual
                      ? `${cor} border-transparent`
                      : "bg-transparent border-border text-muted-foreground"
                  )}
                >
                  {completo ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : atual ? (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  ) : null}
                </div>
                <div
                  className={cn(
                    "flex-1 h-0.5",
                    i === estagios.length - 1 && "invisible",
                    completo ? "bg-emerald-500" : "bg-border"
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[10px] text-center px-0.5 truncate w-full",
                  atual
                    ? "font-bold text-foreground"
                    : completo
                    ? "text-foreground/80"
                    : "text-muted-foreground"
                )}
                title={ESTAGIO_LABELS[e]}
              >
                {ESTAGIO_LABELS[e]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile: atual + vizinhos */}
      <div className="flex sm:hidden items-center justify-between gap-1">
        {(() => {
          if (foraDoPipeline) {
            return (
              <span className="text-xs text-muted-foreground">
                Fluxo fora do pipeline principal
              </span>
            );
          }
          const ini = Math.max(0, idxAtual - 1);
          const fim = Math.min(estagios.length, idxAtual + 2);
          const visiveis = estagios.slice(ini, fim);
          return (
            <>
              {ini > 0 && <span className="text-xs text-muted-foreground">…</span>}
              {visiveis.map((e) => {
                const i = estagios.indexOf(e);
                const completo = i < idxAtual;
                const atual = i === idxAtual;
                const cor = ESTAGIO_CORES[e];
                return (
                  <div key={e} className="flex flex-col items-center min-w-0 flex-1">
                    <div
                      className={cn(
                        "h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2",
                        completo || atual
                          ? `${cor} border-transparent`
                          : "bg-transparent border-border text-muted-foreground"
                      )}
                    >
                      {completo ? <Check className="h-3.5 w-3.5" /> : atual ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                    </div>
                    <span
                      className={cn(
                        "mt-1 text-[10px] text-center truncate w-full",
                        atual ? "font-bold" : "text-muted-foreground"
                      )}
                    >
                      {ESTAGIO_LABELS[e]}
                    </span>
                  </div>
                );
              })}
              {fim < estagios.length && <span className="text-xs text-muted-foreground">…</span>}
            </>
          );
        })()}
      </div>
    </div>
  );
}
