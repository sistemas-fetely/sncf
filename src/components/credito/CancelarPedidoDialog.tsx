import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface Props {
  pedidoId: string;
  pedidoIdExterno: string | null;
  open: boolean;
  onClose: () => void;
}

export function CancelarPedidoDialog({ pedidoId, pedidoIdExterno, open, onClose }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cancelar_pedido", {
        p_pedido_id: pedidoId,
        p_motivo: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao cancelar pedido.");
      return data;
    },
    onSuccess: () => {
      toast.success("Pedido cancelado.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const podeConfirmar = motivo.trim().length >= 5 && !mut.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar pedido {pedidoIdExterno ?? ""}</DialogTitle>
          <DialogDescription>
            Encerramento do pedido inteiro (pré-NF).
          </DialogDescription>
        </DialogHeader>

        <Alert className="border-amber-300 bg-amber-50">
          <AlertTriangle className="h-4 w-4 !text-amber-700" />
          <AlertDescription className="text-xs text-amber-900">
            Isto cancela o <strong>pedido inteiro</strong> e todas as suas parcelas.
            Solicita a baixa dos boletos vivos e converte pagamentos já recebidos em
            <strong> haver do cliente</strong>.
          </AlertDescription>
        </Alert>

        <div className="space-y-2 mt-2">
          <Label>Motivo (obrigatório)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Explique o motivo do cancelamento..."
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={!podeConfirmar}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
