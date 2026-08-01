import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
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
import { useConfirmarPagamentoPortao } from "@/hooks/pedidos/useConfirmarPagamentoPortao";

interface Props {
  pedido_id: string;
  rotulo?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  /** "padrao" = botão com rótulo (default, preserva todos os consumidores atuais).
   *  "discreta" = ícone ghost com tooltip, para uso em linha de tabela. */
  variante?: "padrao" | "discreta";
}

export function ConfirmarPortaoPagoDialog({
  pedido_id,
  rotulo,
  triggerLabel = "Confirmar pagamento",
  triggerClassName,
  variante = "padrao",
}: Props) {

  const [open, setOpen] = useState(false);
  const [dataPagamento, setDataPagamento] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [observacao, setObservacao] = useState<string>("");

  const confirmar = useConfirmarPagamentoPortao();

  const handleConfirmar = async () => {
    await confirmar.mutateAsync({
      pedido_id,
      data_pagamento: dataPagamento,
      observacao,
    });
    setOpen(false);
    setObservacao("");
    setDataPagamento(new Date().toISOString().slice(0, 10));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!confirmar.isPending) setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        {variante === "discreta" ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            title={triggerLabel}
            aria-label={triggerLabel}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        ) : (
          <Button className={triggerClassName}>{triggerLabel}</Button>
        )}
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento do portão</DialogTitle>
          <DialogDescription>
            {rotulo ??
              "Marca o portão como pago, gera os títulos definitivos e avança o pedido pra pré-faturamento."}
          </DialogDescription>
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
            onClick={handleConfirmar}
            disabled={confirmar.isPending || !dataPagamento}
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
