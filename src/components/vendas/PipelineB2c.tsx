import { AlertTriangle, Inbox, Receipt, Clock, Package, FileText, Truck, PackageCheck, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineB2c } from "@/hooks/vendas/useB2c";

/**
 * Casa do B2C — pipeline horizontal do canal loja.
 * Lê vw_pipeline_b2c (uma linha por estágio). NÃO reaproveita PipelineHorizontal:
 * aquela é do B2B e tem outro catálogo de estágios.
 */

const ICONES: Record<string, JSX.Element> = {
  recebido: <Inbox className="h-4 w-4" />,
  cobranca: <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_separacao: <Clock className="h-4 w-4" />,
  em_separacao: <Package className="h-4 w-4" />,
  pre_faturamento: <FileText className="h-4 w-4" />,
  faturado: <FileText className="h-4 w-4" />,
  em_transporte: <Truck className="h-4 w-4" />,
  entregue: <PackageCheck className="h-4 w-4" />,
  cancelado: <AlertTriangle className="h-4 w-4" />,
};

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

interface Props {
  estagioAtivo?: string | null;
  onClickEstagio?: (estagio: string) => void;
  onLimparFiltro?: () => void;
  incluirCancelados?: boolean;
  onToggleCancelados?: (v: boolean) => void;
  /** Fila ativa — vem da MESMA lista que a tabela da aba Fila mostra. */
  filaAtiva?: { qtd: number; valor: number };
  /** Carrinhos abandonados — vem da MESMA query da aba Carrinhos. */
  carrinhos?: { qtd: number; valor: number };
  onAbrirCarrinhos?: () => void;
}

export function PipelineB2c({
  estagioAtivo,
  onClickEstagio,
  onLimparFiltro,
  incluirCancelados = false,
  onToggleCancelados,
  filaAtiva,
  carrinhos,
  onAbrirCarrinhos,
}: Props) {
  const { data, isLoading, isError, error } = usePipelineB2c();

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
        Erro ao carregar o pipeline do B2C: {(error as Error)?.message ?? "erro desconhecido"}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-20 flex-1" />
        ))}
      </div>
    );
  }

  const fases = (data ?? []).filter((r) => r.visivel_no_pipeline);

  return (
    <div className="flex gap-2">
      {/* Fila ativa */}
      <button
        type="button"
        onClick={() => onLimparFiltro?.()}
        title="Pedidos da loja em andamento (na carteira ativa). Cancelados entram só com o toggle ao lado."
        className={cn(
          "flex min-w-[86px] shrink-0 flex-col items-center justify-center rounded-md border py-2 px-3 transition-all duration-200",
          "gold-border-hover focus-visible:outline-none",
          !estagioAtivo ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card",
        )}
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Fila ativa
        </span>
        <span className="text-lg font-medium tabular-nums">{filaAtiva?.qtd ?? 0}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {fmtBRL.format(filaAtiva?.valor ?? 0)}
        </span>
      </button>

      {/* Toggle: incluir cancelados */}
      <button
        type="button"
        onClick={() => onToggleCancelados?.(!incluirCancelados)}
        aria-pressed={incluirCancelados}
        title="Inclui pedidos cancelados na fila"
        className={cn(
          "flex min-w-[92px] shrink-0 flex-col items-center justify-center rounded-md border py-2 px-3 text-center transition-all duration-200",
          "gold-border-hover focus-visible:outline-none",
          incluirCancelados ? "gold-border bg-gold-soft shadow-sm" : "border-border bg-card",
        )}
      >
        <span className="text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          Incluir<br />cancelados
        </span>
        <span className="text-[11px] font-medium">{incluirCancelados ? "Ligado" : "Desligado"}</span>
      </button>

      {/* Cards por estágio */}
      {fases.map((f) => {
        const qtd = Number(f.qtd ?? 0);
        const alertas = Number(f.com_alerta ?? 0);
        const isAtivo = estagioAtivo === f.estagio;
        return (
          <button
            key={f.estagio}
            type="button"
            onClick={() => onClickEstagio?.(f.estagio)}
            title={`${f.rotulo ?? f.estagio}: ${qtd} pedido${qtd !== 1 ? "s" : ""}${
              f.proxima_acao ? ` · ${f.proxima_acao}` : ""
            }`}
            className={cn(
              "group relative flex min-w-0 flex-1 flex-col items-center justify-center rounded-md border py-2 px-1 transition-all duration-200",
              "gold-border-hover focus-visible:outline-none",
              isAtivo
                ? "gold-border bg-gold-soft shadow-sm"
                : alertas > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-card",
              qtd === 0 && !isAtivo && "opacity-40",
            )}
          >
            <span className={cn("mb-0.5", alertas > 0 ? "text-destructive" : "text-foreground")}>
              {ICONES[f.estagio] ?? <Package className="h-4 w-4" />}
            </span>
            <span className="max-w-full truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {f.rotulo ?? f.estagio}
            </span>
            <span className={cn("text-lg font-medium tabular-nums", alertas > 0 && "text-destructive")}>
              {qtd}
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {fmtBRL.format(Number(f.soma_valor ?? 0))}
            </span>
            {alertas > 0 && (
              <span className="absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                <AlertTriangle className="h-2.5 w-2.5" />
                {alertas}
              </span>
            )}
          </button>
        );
      })}

      {/* Divisor: daqui pra frente não é passo do fluxo */}
      <div className="mx-1 w-px self-stretch bg-border" aria-hidden />

      {/* Carrinhos abandonados */}
      <button
        type="button"
        onClick={() => onAbrirCarrinhos?.()}
        title="Checkouts sem conclusão. Clique para abrir a aba Carrinhos."
        className={cn(
          "flex w-[104px] shrink-0 flex-col items-center justify-center rounded-md border border-dashed bg-muted/40 py-2 px-2 text-muted-foreground transition-all duration-200",
          "gold-border-hover focus-visible:outline-none",
          (carrinhos?.qtd ?? 0) === 0 && "opacity-40",
        )}
      >
        <ShoppingCart className="mb-0.5 h-4 w-4" />
        <span className="text-[10px] font-medium uppercase leading-tight tracking-wide">
          Carrinhos
        </span>
        <span className="text-[11px] font-medium tabular-nums">
          {carrinhos?.qtd ?? 0} {(carrinhos?.qtd ?? 0) === 1 ? "carrinho" : "carrinhos"}
        </span>
        <span className="text-[10px] tabular-nums">{fmtBRL.format(carrinhos?.valor ?? 0)}</span>
      </button>
    </div>
  );
}
