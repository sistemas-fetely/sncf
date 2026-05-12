import { useEffect, useState } from "react";
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
import { useCancelarItemPedido } from "@/hooks/compras/useCancelarItemPedido";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string | null;
  itemDescricao?: string;
}

export function CancelarItemDialog({ open, onOpenChange, itemId, itemDescricao }: Props) {
  const [motivo, setMotivo] = useState("");
  const cancelar = useCancelarItemPedido();

  useEffect(() => {
    if (open) setMotivo("");
  }, [open]);

  const podeConfirmar = motivo.trim().length >= 3 && !!itemId;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar item do pedido</AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{itemDescricao || "Item"}</span>
            <br />
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label>Motivo do cancelamento (mín. 3 caracteres) *</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex: produto descontinuado, item indisponível..."
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!podeConfirmar || cancelar.isPending}
            onClick={async (e) => {
              e.preventDefault();
              if (!itemId) return;
              await cancelar.mutateAsync({ item_id: itemId, motivo: motivo.trim() });
              onOpenChange(false);
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Confirmar cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
