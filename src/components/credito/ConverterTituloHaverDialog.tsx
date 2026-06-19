import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tituloId: string;
  numeroTitulo: string;
  valor: number;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ConverterTituloHaverDialog({ open, onOpenChange, tituloId, numeroTitulo, valor }: Props) {
  const [motivo, setMotivo] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("converter_titulo_em_haver", {
        p_titulo_id: tituloId,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Título convertido em crédito com sucesso");
      qc.invalidateQueries({ queryKey: ["todos-titulos"] });
      qc.invalidateQueries({ queryKey: ["credito-clientes-haveres"] });
      qc.invalidateQueries({ queryKey: ["haver-disponivel"] });
      onOpenChange(false);
      setMotivo("");
    },
    onError: (err: any) => toast.error(err.message ?? "Erro ao converter título"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Converter título em crédito</DialogTitle>
          <DialogDescription>
            O título <span className="font-medium">{numeroTitulo}</span> ({fmtBRL.format(valor)}) será
            cancelado e o valor virará crédito disponível para o cliente.
            Esta ação não pode ser desfeita.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo">Motivo *</Label>
          <Textarea
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Descreva o motivo da conversão"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!motivo.trim() || mutation.isPending}
          >
            {mutation.isPending ? "Convertendo..." : "Confirmar conversão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
