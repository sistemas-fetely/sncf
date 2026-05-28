import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { useConfirmarPagamento } from "@/hooks/pedidos/useConfirmarPagamento";

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  pedido_id: string;
  valor_pedido: number;
}

export function ConfirmarPagamentoDialog({ pedido_id, valor_pedido }: Props) {
  const [open, setOpen] = useState(false);
  const hoje = new Date().toISOString().slice(0, 10);
  const [dataPagamento, setDataPagamento] = useState(hoje);
  const [valor, setValor] = useState(String(valor_pedido));
  const [comprovanteLink, setComprovanteLink] = useState("");
  const [observacao, setObservacao] = useState("");

  const confirmar = useConfirmarPagamento();

  // Reset ao reabrir
  useEffect(() => {
    if (open) {
      setDataPagamento(hoje);
      setValor(String(valor_pedido));
      setComprovanteLink("");
      setObservacao("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const valorNum = Number(valor);
  const formularioValido = !!dataPagamento && !isNaN(valorNum) && valorNum > 0;

  const handleConfirm = async () => {
    if (!formularioValido) return;
    await confirmar.mutateAsync({
      pedido_id,
      data_pagamento: dataPagamento,
      valor: valorNum,
      comprovante_link: comprovanteLink.trim() || undefined,
      observacao: observacao.trim() || undefined,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          Confirmar pagamento
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
          <DialogDescription>
            Registra a entrada do pagamento e libera o pedido pro Bling.
            <span className="block mt-1 text-xs text-muted-foreground">
              Pra boleto parcelado, registra a 1ª parcela. Demais parcelas são geridas em Contas a Receber depois do faturamento.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Data do pagamento *</Label>
              <Input
                type="date"
                value={dataPagamento}
                onChange={(e) => setDataPagamento(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Valor recebido *</Label>
              <Input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          {valorNum > 0 && Math.abs(valorNum - valor_pedido) > 0.01 && (
            <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs">
              <strong>Atenção:</strong> valor recebido ({fmtBRL.format(valorNum)}) difere do valor do pedido ({fmtBRL.format(valor_pedido)}). Anota o motivo na observação.
            </div>
          )}

          <div className="space-y-2">
            <Label>Comprovante (link, opcional)</Label>
            <Input
              type="url"
              value={comprovanteLink}
              onChange={(e) => setComprovanteLink(e.target.value)}
              placeholder="https://drive.google.com/..."
            />
          </div>

          <div className="space-y-2">
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: pagou via PIX em vez do boleto solicitado."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={handleConfirm}
            disabled={!formularioValido || confirmar.isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {confirmar.isPending ? "Confirmando..." : "Confirmar e avançar pro Bling"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
