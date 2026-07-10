import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateBR } from "@/lib/format-currency";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";

interface Props {
  titulo: TituloCobranca;
  open: boolean;
  onClose: () => void;
}

function amanhaISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function ProrrogarVencimentoDialog({ titulo, open, onClose }: Props) {
  const qc = useQueryClient();
  const minData = useMemo(() => amanhaISO(), []);
  const [novaData, setNovaData] = useState<string>(minData);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!novaData || novaData < minData) {
        throw new Error("Escolha uma data de vencimento a partir de amanhã.");
      }
      const { data, error } = await (supabase as any).rpc("solicitar_prorrogacao_boleto", {
        p_titulo_id: titulo.id,
        p_nova_data: novaData,
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao registrar prorrogação.");
      return data;
    },
    onSuccess: () => {
      toast.success("Prorrogação registrada. Gere a remessa para enviar ao banco.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao registrar prorrogação."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prorrogar vencimento — {titulo.numero_titulo}</DialogTitle>
          <DialogDescription>
            O boleto original permanece registrado. A nova data será enviada ao banco
            como instrução de alteração de vencimento (ocorrência 06).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground">
            Vencimento atual:{" "}
            <span className="font-medium text-foreground">
              {formatDateBR(titulo.data_vencimento_atual)}
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prorrog-nova-data">Nova data de vencimento *</Label>
            <Input
              id="prorrog-nova-data"
              type="date"
              min={minData}
              value={novaData}
              onChange={(e) => setNovaData(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Registrando..." : "Registrar prorrogação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
