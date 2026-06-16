import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  pedido_id: string;
  rotulo?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export function ConfirmarPortaoPagoDialog({
  pedido_id,
  rotulo,
  triggerLabel = "Confirmar portão (1º pagamento)",
  triggerClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [observacao, setObservacao] = useState<string>("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const confirmar = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("confirmar_portao_pago", {
        p_pedido_id: pedido_id,
        p_data_pagamento: dataPagamento,
        p_observacao: observacao?.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Portão confirmado",
        description:
          "Pagamento registrado. O pedido avançou para pré-faturamento.",
      });
      ["pedido-detalhe", "pedidos-fila", "pedidos-pipeline", "cobranca-fila", "primeiro-pagamento-fila", "aguardando-pagamento-fila"].forEach(
        (k) => qc.invalidateQueries({ queryKey: [k] }),
      );
      setOpen(false);
      setObservacao("");
      setDataPagamento(new Date().toISOString().slice(0, 10));
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao confirmar portão",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!confirmar.isPending) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button className={triggerClassName}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento do portão</DialogTitle>
          {rotulo && <DialogDescription>{rotulo}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data-pagamento-portao">Data do pagamento</Label>
            <Input
              id="data-pagamento-portao"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="observacao-portao">Observação (opcional)</Label>
            <Textarea
              id="observacao-portao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: PIX recebido na conta Safra"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={confirmar.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={() => confirmar.mutate()}
            disabled={confirmar.isPending}
          >
            {confirmar.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Confirmar pagamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
