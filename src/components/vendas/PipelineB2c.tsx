import { AlertTriangle, Inbox, Receipt, Clock, Package, FileText, Truck, PackageCheck, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineB2c } from "@/hooks/vendas/useB2c";

/**
 * Casa do B2C — pipeline horizontal do canal loja.
 * Lê vw_pipeline_b2c (uma linha por estágio). NÃO reaproveita PipelineHorizontal:
 * aquela é do B2B e tem outro catálogo de estágios.
 *
 * ENTRADA-B2C-POR-FASES (19/09/2026): a régua é só de FASES. "Fila ativa" e
 * "incluir cancelados" não são fase — saíram para a linha de filtros.
 */

const ICONES: Record<string, JSX.Element> = {
  recebido: <Inbox className="h-4 w-4" />,
  cobranca: <Receipt className="h-4 w-4" />,
  aguardando_pagamento: <Clock className="h-4 w-4" />,
  pre_separacao: <Clock className="h-4 w-4" />,
  em_separacao: <Package className="h-4 w-4" />,
  pre_faturamento: <FileText className="h-4 w-4" />,
  faturado: <FileText className="h-4 w-4" />,
  travado: <AlertTriangle className="h-4 w-4" />,
  em_transporte: <Truck className="h-4 w-4" />,
  entregue: <PackageCheck className="h-4 w-4" />,
  cancelado: <Ban className="h-4 w-4" />,
};

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export interface ContagemEstagio {
  qtd: number;
  valor: number;
  alerta: number;
}

interface Props {
  estagioAtivo?: string | null;
  onClickEstagio?: (estagio: string) => void;
  onLimparFiltro?: () => void;
  /**
   * BADGE-LÊ-A-MESMA-FONTE: quantos alertas por estágio devem deixar de contar —
   * pedidos sem pedido interno SNCF cuja descida ao Bling está em dia (na fila
   * ou já enviado) não são problema. Reduz o com_alerta da view, nunca aumenta.
   */
  reducaoAlerta?: Record<string, number>;
  /**
   * Quando há filtro de CD ativo, a régua precisa contar a MESMA lista que a
   * tabela mostra — a view de pipeline é do total. Em modo Total, fica nulo.
   */
  contagens?: Record<string, ContagemEstagio> | null;
  /** Pedidos parados em Recebido há mais de 2h sem CD escolhido. */
  alertaSemCd?: number;
}

export function PipelineB2c({
  estagioAtivo,
  onClickEstagio,
  onLimparFiltro,
  reducaoAlerta,
  contagens,
  alertaSemCd = 0,
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
        const c = contagens?.[f.estagio];
        const qtd = c ? c.qtd : Number(f.qtd ?? 0);
        const valor = c ? c.valor : Number(f.soma_valor ?? 0);
        const alertas = c
          ? c.alerta
          : Math.max(0, Number(f.com_alerta ?? 0) - (reducaoAlerta?.[f.estagio] ?? 0));
        const isAtivo = estagioAtivo === f.estagio;
        const desvio = !!f.eh_desvio;
        const semCd = f.estagio === "recebido" && alertaSemCd > 0;
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
                : desvio
                ? "border-destructive/60 bg-destructive/10"
                : alertas > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-card",
              qtd === 0 && !isAtivo && "opacity-40",
            )}
          >
            <span className={cn("mb-0.5", desvio || alertas > 0 ? "text-destructive" : "text-foreground")}>
              {ICONES[f.estagio] ?? <Package className="h-4 w-4" />}
            </span>
            <span
              className={cn(
                "max-w-full truncate text-[10px] font-medium uppercase tracking-wide",
                desvio ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {f.rotulo ?? f.estagio}
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
                {alertaSemCd} há +2h
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
