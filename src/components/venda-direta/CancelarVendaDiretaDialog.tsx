import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCancelarPedido } from "@/hooks/pedidos/useCancelarPedido";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invalidarVendaDireta, type LinhaVD } from "@/components/venda-direta/AcoesVendaDireta";

/** Cancelamento direto da gestão Site SP — mesmo RPC cancelar_pedido, sem o passo de substituto. */
export function CancelarVendaDiretaDialog({ linha, onClose }: { linha: LinhaVD | null; onClose: () => void }) {
  const qc = useQueryClient();
  const m = useCancelarPedido();
  const [motivo, setMotivo] = useState("");
  useEffect(() => { if (linha) setMotivo(""); }, [linha]);

  const confirmar = async () => {
    if (!linha) return;
    try {
      await m.mutateAsync({ pedido_id: linha.id, motivo: motivo.trim() });
      toast.success(`Pedido ${linha.id_externo ?? ""} cancelado`);
      await invalidarVendaDireta(qc);
      onClose();
    } catch {
      // FAIL-LOUD: o hook já mostrou a mensagem real do banco; o diálogo fica aberto.
    }
  };

  const ok = motivo.trim().length >= 5;
  return (
    <Dialog open={!!linha} onOpenChange={(v) => !v && !m.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar pedido · {linha?.id_externo}</DialogTitle>
          <DialogDescription>{linha?.cliente_nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Motivo *</Label>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus placeholder="Mínimo de 5 caracteres" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>Voltar</Button>
          <Button variant="destructive" onClick={confirmar} disabled={!ok || m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Cancelar pedido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
