import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCancelarPedidoPedido } from "@/hooks/compras/useCancelarPedidoPedido";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  onCancelado?: () => void;
}

export function CancelarPedidoDialog({ open, onOpenChange, pedidoId, onCancelado }: Props) {
  const [motivo, setMotivo] = useState("");
  const cancelar = useCancelarPedidoPedido();

  const handleConfirmar = async () => {
    if (motivo.trim().length < 5) return;
    try {
      await cancelar.mutateAsync({ pedido_id: pedidoId, motivo: motivo.trim() });
      setMotivo("");
      onOpenChange(false);
      onCancelado?.();
    } catch {
      /* toast já mostrado pelo hook */
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setMotivo("");
        onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar pedido inteiro?</AlertDialogTitle>
          <AlertDialogDescription>
            Todos os itens pendentes serão cancelados e o pedido vai para o status
            "Cancelado". Esta ação não pode ser desfeita. Se houver compras já
            registradas para este pedido, é necessário excluí-las antes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label>Motivo do cancelamento *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Mínimo 5 caracteres"
            rows={3}
            maxLength={500}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelar.isPending}>Manter pedido</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirmar();
            }}
            disabled={motivo.trim().length < 5 || cancelar.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {cancelar.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Confirmar cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
