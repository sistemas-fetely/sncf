import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useReverterParaCobranca } from "@/hooks/pedidos/useReverterParaCobranca";

interface Props {
  open: boolean;
  onClose: () => void;
  pedidoId: string;
  idExterno: string;
  estagio: "aguardando_pagamento" | "pre_separacao";
}

const estagioLabel: Record<"aguardando_pagamento" | "pre_separacao", string> = {
  aguardando_pagamento: "Aguardando Pagamento",
  pre_separacao: "Pré-Separação",
};

export function ReverterParaCobrancaDialog({
  open, onClose, pedidoId, idExterno, estagio,
}: Props) {
  const [erroRpc, setErroRpc] = useState<string | null>(null);
  const reverter = useReverterParaCobranca();

  async function handleConfirmar() {
    setErroRpc(null);
    try {
      await reverter.mutateAsync(pedidoId);
    } catch (e: any) {
      setErroRpc(e?.message ?? "Erro ao reverter pedido");
    }
  }

  function handleClose() {
    if (reverter.isPending) return;
    setErroRpc(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Voltar para cobrança</DialogTitle>
          <DialogDescription>
            Reverte o pedido <strong>{idExterno}</strong> de{" "}
            {estagioLabel[estagio] ?? estagio} para{" "}
            Cobrança.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="space-y-2">
              <p>
                Todos os títulos abertos deste pedido serão cancelados.
              </p>
              <p>
                Após reverter, a cobrança precisará ser rematerializada do zero na tela de Cobrança.
              </p>
            </AlertDescription>
          </Alert>

          {erroRpc && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{erroRpc}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={reverter.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={reverter.isPending}>
            {reverter.isPending ? "Revertendo…" : "Confirmar reversão"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
