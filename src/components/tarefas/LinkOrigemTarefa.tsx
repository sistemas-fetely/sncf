import { Link } from "react-router-dom";
import { PackageSearch, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { pedidoIdDaUrl, usePedidoVinculado } from "@/hooks/tarefas/usePedidosParaVinculo";
import { tituloIdDaUrl, useTituloVinculado } from "@/hooks/tarefas/useTitulosParaVinculo";

interface Props {
  /** acao_url da tarefa — `/pedidos/{id}` ou a rota do título a receber */
  acaoUrl: string | null | undefined;
  /** modulo_origem, quando disponível: 'pedidos' | 'cobranca' */
  moduloOrigem?: string | null;
  className?: string;
}

const CLASSE_BASE =
  "inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground";

/**
 * Selo discreto com o código da entidade vinculada (pedido ou título a receber),
 * clicável para a ficha. Um componente só para os dois tipos — o tipo sai do
 * `modulo_origem` quando existe e, senão, do formato da própria acao_url.
 */
export function LinkOrigemTarefa({ acaoUrl, moduloOrigem, className }: Props) {
  const pedidoId = pedidoIdDaUrl(acaoUrl);
  const tituloId = tituloIdDaUrl(acaoUrl);

  const ehTitulo = moduloOrigem === "cobranca" || (!pedidoId && !!tituloId);
  const ehPedido = !ehTitulo && !!pedidoId;

  const { data: pedido } = usePedidoVinculado(ehPedido ? pedidoId : null);
  const { data: titulo } = useTituloVinculado(ehTitulo ? tituloId : null);

  if (ehTitulo && tituloId) {
    return (
      <Link
        to={acaoUrl!}
        onClick={(e) => e.stopPropagation()}
        className={cn(CLASSE_BASE, className)}
        title={titulo?.cliente ? `Título de ${titulo.cliente}` : "Título a receber vinculado"}
      >
        <Receipt className="h-3 w-3 shrink-0" />
        {titulo?.codigo ?? "Título"}
        {titulo?.vencido && <span className="text-destructive">· vencido</span>}
        {titulo?.encerrado && <span className="opacity-70">· encerrado</span>}
      </Link>
    );
  }

  if (!ehPedido) return null;

  return (
    <Link
      to={acaoUrl!}
      onClick={(e) => e.stopPropagation()}
      className={cn(CLASSE_BASE, className)}
      title={pedido?.cliente ? `Pedido de ${pedido.cliente}` : "Pedido vinculado"}
    >
      <PackageSearch className="h-3 w-3 shrink-0" />
      {pedido?.codigo ?? "Pedido"}
      {pedido?.encerrado && <span className="opacity-70">· encerrado</span>}
    </Link>
  );
}
