import { Link } from "react-router-dom";
import { PackageSearch } from "lucide-react";
import { cn } from "@/lib/utils";
import { pedidoIdDaUrl, usePedidoVinculado } from "@/hooks/tarefas/usePedidosParaVinculo";

interface Props {
  /** acao_url da tarefa (`/pedidos/{id}`) — sistêmica ou manual, dá no mesmo */
  acaoUrl: string | null | undefined;
  className?: string;
}

/**
 * Selo discreto com o código do pedido vinculado, clicável para a ficha.
 * Só aparece quando a acao_url aponta para um pedido; qualquer outra
 * origem continua sem selo (nada quebra).
 */
export function LinkPedidoTarefa({ acaoUrl, className }: Props) {
  const pedidoId = pedidoIdDaUrl(acaoUrl);
  const { data: pedido } = usePedidoVinculado(pedidoId);
  if (!pedidoId) return null;

  return (
    <Link
      to={acaoUrl!}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground",
        className,
      )}
      title={pedido?.cliente ? `Pedido de ${pedido.cliente}` : "Pedido vinculado"}
    >
      <PackageSearch className="h-3 w-3 shrink-0" />
      {pedido?.codigo ?? "Pedido"}
      {pedido?.encerrado && <span className="opacity-70">· encerrado</span>}
    </Link>
  );
}
