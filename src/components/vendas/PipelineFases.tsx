import type { ReactNode } from "react";
import { AlertTriangle, Clock, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface FasePipeline {
  codigo: string;
  rotulo: string;
  proxima_acao?: string | null;
  qtd: number;
  valor: number;
  alertas: number;
  icone?: ReactNode;
  /** B2C deviation and pending-CD signals retain their existing presentation. */
  eh_desvio?: boolean;
  alertaSemCd?: number;
}
const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export function PipelineFases({ fases, estagioAtivo, onClickEstagio, onLimparFiltro, carregando, erro }: {
  fases: FasePipeline[];
  estagioAtivo?: string | null;
  onClickEstagio?: (estagio: string) => void;
  onLimparFiltro?: () => void;
  carregando?: boolean;
  erro?: string | null;
}) {
  if (erro) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        {erro}
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* Limpar o filtro de fase */}
      <button
        type="button"
        onClick={() => onLimparFiltro?.()}
        title="Mostrar todas as fases"
        className={cn(
          "flex min-w-[70px] shrink-0 flex-col items-center justify-center rounded-md border py-2 px-3 transition-all duration-200",
          "gold-border-hover focus-visible:outline-none",
          !estagioAtivo ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card",
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Todas
        </span>
        <span className="text-[11px] text-muted-foreground">as fases</span>
      </button>

      {/* Cards por estágio */}
      {fases.map((f) => {
        const { qtd, valor, alertas } = f;
        const isAtivo = estagioAtivo === f.codigo;
        const desvio = !!f.eh_desvio;
        const semCd = (f.alertaSemCd ?? 0) > 0;
        return (
          <button
            key={f.codigo}
            type="button"
            onClick={() => onClickEstagio?.(f.codigo)}
            title={`${f.rotulo ?? f.codigo}: ${qtd} pedido${qtd !== 1 ? "s" : ""}${
              f.proxima_acao ? ` · ${f.proxima_acao}` : ""
            }`}
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border py-2 px-1 transition-all duration-200",
              "gold-border-hover focus-visible:outline-none",
              isAtivo
                ? "gold-border bg-gold-soft shadow-sm"
                : desvio
                ? "border-destructive/60 bg-destructive/10"
                : alertas > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-card",
              qtd === 0 && !isAtivo && "opacity-40",
            )}
          >
            <span className={cn("mb-0.5", desvio || alertas > 0 ? "text-destructive" : "text-foreground")}>
              {f.icone ?? <Package className="h-4 w-4" />}
            </span>
            <span
              className={cn(
                "max-w-full truncate text-[10px] font-medium uppercase tracking-wide",
                desvio ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {f.rotulo ?? f.codigo}
            </span>
            <span
              className={cn(
                "text-lg font-medium tabular-nums",
                (desvio || alertas > 0) && "text-destructive",
              )}
            >
              {qtd}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {fmtBRL.format(valor)}
            </span>
            {semCd ? (
              <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning-strong">
                <Clock className="h-2.5 w-2.5" />
                {f.alertaSemCd} há +2h
              </span>
            ) : (
              alertas > 0 && (
                <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {alertas}
                </span>
              )
            )}
          </button>
        );
      })}
    </div>
  );
}
