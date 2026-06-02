import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIO_LABELS_CURTO, PIPELINE_PRINCIPAL } from "@/types/pedido";
import { ESTAGIO_CORES } from "@/components/pedidos/BadgesPedido";
import type { EstagioPedido } from "@/types/pedido";
import { AlertTriangle } from "lucide-react";

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n || 0);

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

  const ativos = estagios.filter(
    (e) => e.estagio !== "entregue" && e.estagio !== "cancelado" && e.estagio !== "recuperacao_venda"
  );
  const totalOperacao = estagios
    .filter((e) => e.estagio !== "entregue")
    .reduce((acc, e) => acc + e.qtd, 0);
  const totalSla = estagios.reduce((acc, e) => acc + e.sla, 0);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho resumo */}
      <div className="flex items-center justify-between px-1">
        <div className="text-sm">
          <span className="font-semibold">{totalOperacao}</span>
          <span className="text-muted-foreground">
            {" "}
            pedidos em operação
          </span>
        </div>
        {totalSla > 0 && (
          <div className="flex items-center gap-1 text-xs text-red-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {totalSla} com SLA estourado
          </div>
        )}
      </div>

      {/* Cards por estágio */}
      {ativos.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          Nenhum pedido em operação.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {ativos.map(({ estagio, qtd, valor, sla }) => {
            const isAtivo = estagioAtivo === estagio;

            return (
              <button
                key={estagio}
                type="button"
                onClick={() => onClickEstagio?.(estagio)}
                className={cn(
                  "group relative text-left rounded-lg border bg-card p-4 transition-all duration-200",
                  "gold-border-hover",
                  isAtivo
                    ? "gold-border bg-gold-soft shadow-sm"
                    : "border-border"
                )}
              >
                {/* Borda esquerda colorida */}
                <div
                  className={cn(
                    "absolute left-0 top-0 bottom-0 w-1 rounded-l-lg",
                    ESTAGIO_CORES[estagio]
                  )}
                />

                <div className="pl-2 space-y-2">
                  {/* Estágio */}
                  <div className="text-xs text-muted-foreground font-medium truncate">
                    {ESTAGIO_LABELS_CURTO[estagio]}
                  </div>

                  {/* Quantidade — destaque principal */}
                  <div
                    className={cn(
                      "text-2xl font-display font-semibold leading-none",
                      isAtivo ? "text-[hsl(var(--gold))]" : "text-foreground"
                    )}
                  >
                    {qtd}
                  </div>

                  {/* Valor */}
                  <div className="text-sm text-muted-foreground font-medium">
                    {fmtBRL(valor)}
                  </div>

                  {/* SLA badge */}
                  {sla > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-950/40">
                      <AlertTriangle className="h-3 w-3" />
                      {sla} SLA
                    </div>
                  )}
                </div>

                {/* Linha dourada de foco no hover */}
                <div className="absolute bottom-0 left-1 right-1 h-0.5 rounded-full bg-[hsl(var(--gold))] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
