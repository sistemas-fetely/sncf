/**
 * Cobertura do cliente — SOMENTE LEITURA.
 *
 * O pedido não é mais o dono do dinheiro: ele valida contra o saldo da conta do
 * cliente. Este card mostra o que o sistema sugere; a decisão (e o portão novo)
 * é fatia posterior. Nada aqui libera nada.
 */
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { formatBRL } from "@/lib/format-currency";
import { useContaClienteCobertura } from "@/hooks/financeiro/useContaCliente";
import { Selo } from "@/components/ui/selo";
import { cn } from "@/lib/utils";

interface Props {
  parceiroId: string | null | undefined;
  valorPedido: number | null | undefined;
}

export function CoberturaClienteCard({ parceiroId, valorPedido }: Props) {
  const { data: cob, isLoading, isError, error } = useContaClienteCobertura(parceiroId);

  if (!parceiroId) return null;

  if (isLoading) {
    return (
      <div className="rounded-md border border-border/60 p-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cobertura do cliente
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
        <p className="font-medium text-destructive">Cobertura do cliente indisponível</p>
        <p className="text-muted-foreground mt-0.5">{(error as any)?.message ?? "Falha ao consultar."}</p>
      </div>
    );
  }

  if (!cob) return null;

  const valor = Number(valorPedido ?? 0);
  const total = Number(cob.cobertura_total ?? 0);
  const cobre = valor > 0 ? total >= valor : total > 0;
  const falta = Math.max(0, valor - total);

  return (
    <div
      className={cn(
        "rounded-md border p-3 space-y-2",
        cobre ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Cobertura do cliente</span>
        {cobre ? (
          <CheckCircle2 className="h-4 w-4 text-success" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-warning" />
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className={cn("text-lg font-semibold", cobre ? "text-success" : "text-warning")}>
          {formatBRL(total)}
        </span>
        <span className="text-[11px] text-muted-foreground">
          pedido {formatBRL(valor)}
        </span>
      </div>

      {!cobre && (
        <p className="text-[11px] text-warning">
          falta {formatBRL(falta)} — rota: análise de crédito
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <dt>Saldo em conta</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte1_saldo_disponivel)}</dd>
        <dt>Limite disponível</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.fonte3_limite_disponivel)}</dd>
        <dt>Em aberto</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.exposicao_em_aberto)}</dd>
        <dt>Vencido em aberto</dt>
        <dd className="text-right text-foreground">{formatBRL(cob.vencido_em_aberto)}</dd>
      </dl>

      {cob.sinal_analise_credito && (
        <Selo estado="warning">sinal para análise de crédito</Selo>
      )}
    </div>
  );
}
