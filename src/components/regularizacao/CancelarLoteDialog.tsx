import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { rawMessage } from "@/lib/format-error";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  loteId: string;
  codigo: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aoCancelar: () => Promise<void> | void;
}

export function CancelarLoteDialog({ loteId, codigo, open, onOpenChange, aoCancelar }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");
  const cancelar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("reg_lote_cancelar", { p_lote_id: loteId, p_motivo: motivo.trim() });
      if (error) throw error;
      return data as { ok?: boolean; codigo?: string; retornos_cancelados?: number } | null;
    },
    onSuccess: async (out) => {
      toast.success(`Lote ${out?.codigo ?? codigo} cancelado${out?.retornos_cancelados ? ` · ${out.retornos_cancelados} retorno(s) cancelado(s)` : ""}.`);
      setMotivo("");
      onOpenChange(false);
      await aoCancelar();
      void qc.invalidateQueries({ queryKey: ["regularizacao"] });
    },
    onError: (e) => toast.error(rawMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!cancelar.isPending) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar lote {codigo}?</DialogTitle>
          <DialogDescription>Os retornos planejados deixam de valer. Nada é alterado no Bling.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="motivo-cancelamento">Motivo</Label>
          <Textarea id="motivo-cancelamento" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: inventário refeito no centro." autoFocus />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancelar.isPending}>Voltar</Button>
          <Button variant="destructive" onClick={() => cancelar.mutate()} disabled={!motivo.trim() || cancelar.isPending}>
            {cancelar.isPending ? "Cancelando…" : "Cancelar lote"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
