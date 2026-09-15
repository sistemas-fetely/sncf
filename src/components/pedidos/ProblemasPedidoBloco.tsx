import { useState } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AbrirChamadoPedidoDialog } from "@/components/pedidos/AbrirChamadoPedidoDialog";

/**
 * PROBLEMA-NAO-RETROCEDE-ESTAGIO (15/09/2026): o princípio agora vale para
 * chamados. Abrir chamado NÃO muda o estágio do pedido — o pedido fica onde
 * está e o chamado corre em paralelo, na Central de Chamados.
 * A tabela `pedido_problema` está congelada: problema de pedido É chamado.
 */
export function ProblemasPedidoBloco({
  pedidoId,
  pedidoIdExterno,
}: {
  pedidoId: string;
  pedidoIdExterno?: string | null;
}) {
  const [chamadoOpen, setChamadoOpen] = useState(false);

  if (!pedidoIdExterno) return null;

  return (
    <div className="px-6 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-2" onClick={() => setChamadoOpen(true)}>
          <Ticket className="h-4 w-4" />
          Abrir chamado
        </Button>
      </div>

      <AbrirChamadoPedidoDialog
        pedidoId={pedidoId}
        pedidoIdExterno={pedidoIdExterno}
        open={chamadoOpen}
        onOpenChange={setChamadoOpen}
      />
    </div>
  );
}
