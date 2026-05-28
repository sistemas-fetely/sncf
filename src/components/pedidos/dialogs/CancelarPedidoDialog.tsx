import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { XCircle } from "lucide-react";
import { useCancelarPedido } from "@/hooks/pedidos/useCancelarPedido";

interface Props {
  pedido_id: string;
}

export function CancelarPedidoDialog({ pedido_id }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const cancelar = useCancelarPedido();

  const motivoValido = motivo.trim().length >= 5;

  const handleConfirm = async () => {
    if (!motivoValido) return;
    await cancelar.mutateAsync({ pedido_id, motivo: motivo.trim() });
    setOpen(false);
    setMotivo("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2">
          <XCircle className="h-4 w-4" />
          Cancelar pedido
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar pedido</DialogTitle>
          <DialogDescription>
            Pedido vai pro estado final "Cancelado". Ação não tem volta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Motivo (mínimo 5 caracteres)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: Cliente desistiu · Pagamento não caiu após 3 dias de tentativa"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Voltar</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!motivoValido || cancelar.isPending}
          >
            {cancelar.isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
