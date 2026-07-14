import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TituloCobranca } from "@/hooks/credito/useTitulosCobranca";
import type { ReguaEtapa } from "@/hooks/credito/useReguaFila";

interface Props {
  titulo: TituloCobranca;
  etapa: ReguaEtapa | null;
  open: boolean;
  onClose: () => void;
}

export function PausarReguaDialog({ titulo, etapa, open, onClose }: Props) {
  const qc = useQueryClient();
  const [motivo, setMotivo] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      if (motivo.trim().length < 5) {
        throw new Error("Motivo deve ter pelo menos 5 caracteres.");
      }
      const { data, error } = await (supabase as any).rpc("registrar_acao_regua", {
        p_titulo_id: titulo.id,
        p_etapa_codigo: etapa?.codigo ?? "pausa_manual",
        p_dias_offset: etapa?.dias_offset ?? (titulo.dias_atraso ?? 0),
        p_resultado: "pausou_regua",
        p_canal_efetivo: null,
        p_mensagem: null,
        p_observacao: motivo.trim(),
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.erro ?? "Erro ao pausar régua.");
      return data;
    },
    onSuccess: () => {
      toast.success("Régua pausada para este título.");
      qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
      qc.invalidateQueries({ queryKey: ["regua-log"] });
      setMotivo("");
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao pausar régua."),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pausar régua</DialogTitle>
          <DialogDescription>
            {titulo.parceiro_razao_social} · {titulo.numero_titulo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O título ficará fora da fila até ser despausado. Pausar não é esconder —
            o motivo fica registrado no histórico da régua.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo <span className="text-red-600">*</span></Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Ex.: cliente pediu prazo até 20/08, ligou e disse que vai pagar amanhã..."
            />
            <p className="text-[11px] text-muted-foreground">
              Mínimo 5 caracteres. {motivo.trim().length}/5
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || motivo.trim().length < 5}
          >
            {mutation.isPending ? "Pausando..." : "Pausar régua"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
