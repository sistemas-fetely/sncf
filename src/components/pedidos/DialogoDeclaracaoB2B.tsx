import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type DeclaracaoB2B = "entrega" | "embarque";

const RPC: Record<DeclaracaoB2B, string> = {
  entrega: "fn_pedido_b2b_declarar_entrega",
  embarque: "fn_pedido_b2b_declarar_embarque",
};
const TITULO: Record<DeclaracaoB2B, string> = {
  entrega: "Declarar entrega",
  embarque: "Declarar embarque",
};

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Permissão das saídas B2B pós-faturamento — a regra vive no banco. */
export function useB2bSaidaPermitida() {
  return useQuery({
    queryKey: ["b2b-saida-permitida"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_b2b_saida_permitida");
      if (error) throw error;
      return data === true;
    },
  });
}

export async function invalidarSaidasB2B(qc: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ["tarefas"] }),
    qc.invalidateQueries({ queryKey: ["pedidos-fila"] }),
  ]);
}

/** Diálogo único "data + motivo" para declarar entrega ou embarque de B2B. */
export function DialogoDeclaracaoB2B({
  tipo,
  pedidoId,
  idExterno,
  open,
  onOpenChange,
}: {
  tipo: DeclaracaoB2B;
  pedidoId: string;
  idExterno?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(hojeIso());
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (open) {
      setData(hojeIso());
      setMotivo("");
    }
  }, [open]);

  const declarar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc(RPC[tipo], {
        p_pedido_id: pedidoId,
        p_data: data,
        p_motivo: motivo.trim(),
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success(tipo === "entrega" ? "Entrega declarada" : "Embarque declarado");
      await invalidarSaidasB2B(qc);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valido = !!data && motivo.trim().length >= 10 && (tipo !== "entrega" || data <= hojeIso());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-base">
            {TITULO[tipo]}
            {idExterno ? ` — ${idExterno}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Data</Label>
            <Input
              type="date"
              value={data}
              max={tipo === "entrega" ? hojeIso() : undefined}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Motivo (mín. 10 caracteres)</Label>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder={tipo === "entrega" ? "Como a entrega foi confirmada" : "Como o embarque foi confirmado"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!valido || declarar.isPending} onClick={() => declarar.mutate()}>
            {TITULO[tipo]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
