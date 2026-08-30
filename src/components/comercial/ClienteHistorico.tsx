import { Badge } from "@/components/ui/badge";
import { formatBRL, formatDateBR } from "@/lib/format-currency";

interface HistoricoCliente {
  eh_primeira_compra: boolean | null;
  cliente_pedidos_faturados: number | null;
  cliente_valor_faturado: number | null;
  cliente_primeira_compra: string | null;
  cliente_ultima_compra: string | null;
  cliente_dias_sem_comprar: number | null;
  cliente_ticket_medio: number | null;
}

/**
 * Tag de primeira compra na linha da Mesa Comercial.
 * Deve ser lida de relance junto com o nome do cliente — é o sinal mais
 * preditivo de risco de pagamento na carteira.
 */
export function PrimeiraCompraBadge({
  eh_primeira_compra,
}: {
  eh_primeira_compra: boolean | null;
}) {
  if (!eh_primeira_compra) return null;
  return (
    <Badge
      variant="outline"
      className="rounded px-1.5 py-0 text-[10px] bg-primary/10 text-primary border-primary/20"
      title="Cliente em primeira compra — alto índice de pedidos que travam no pagamento"
    >
      1ª compra
    </Badge>
  );
}

/**
 * Bloco de histórico do cliente na aba Obs. Comerciais do drawer.
 * Mesmas informações da tag, mas com contexto numérico para o vendedor.
 */
export function ClienteHistoricoBloco({
  historico,
}: {
  historico: HistoricoCliente;
}) {
  const {
    eh_primeira_compra,
    cliente_pedidos_faturados,
    cliente_valor_faturado,
    cliente_primeira_compra,
    cliente_ultima_compra,
    cliente_dias_sem_comprar,
    cliente_ticket_medio,
  } = historico;

  return (
    <div className="rounded-md border px-3 py-2 space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        Histórico do cliente
      </p>
      {eh_primeira_compra ? (
        <p className="text-sm font-medium text-primary">
          Primeira compra deste cliente
        </p>
      ) : (
        <>
          <p className="text-sm">
            Pedidos faturados:{" "}
            <span className="font-medium">
              {cliente_pedidos_faturados ?? 0}
            </span>
            {" · "}Valor total faturado:{" "}
            <span className="font-medium">
              {formatBRL(Number(cliente_valor_faturado ?? 0))}
            </span>
          </p>
          <p className="text-sm">
            Ticket médio:{" "}
            <span className="font-medium">
              {formatBRL(Number(cliente_ticket_medio ?? 0))}
            </span>
          </p>
          <p className="text-sm">
            Última compra:{" "}
            <span className="font-medium">
              {cliente_ultima_compra ? formatDateBR(cliente_ultima_compra) : "—"}
            </span>
            {typeof cliente_dias_sem_comprar === "number" && (
              <span className="text-muted-foreground">
                {" "}
                ({cliente_dias_sem_comprar} dia
                {cliente_dias_sem_comprar === 1 ? "" : "s"} sem comprar)
              </span>
            )}
          </p>
          {cliente_primeira_compra && (
            <p className="text-xs text-muted-foreground">
              Primeira compra em: {formatDateBR(cliente_primeira_compra)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
