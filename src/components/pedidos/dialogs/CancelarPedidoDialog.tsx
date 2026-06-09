import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, CheckCircle2, CopyPlus, AlertTriangle, Info } from "lucide-react";
import { useCancelarPedido } from "@/hooks/pedidos/useCancelarPedido";
import { useClonarPedido } from "@/hooks/pedidos/useClonarPedido";

interface Props {
  pedido_id: string;
  id_externo: string;
  estagio: string;
}

const ESTAGIOS_BLOQUEADOS = ["faturado", "em_transporte", "entregue"];

export function CancelarPedidoDialog({ pedido_id, id_externo, estagio }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [step, setStep] = useState<"confirm" | "result">("confirm");
  const [resultado, setResultado] = useState<{
    titulos_cancelados: number;
    boletos_baixa_pendente: number;
    valor_credito_pendente: number;
  } | null>(null);

  const cancelar = useCancelarPedido();
  const clonar = useClonarPedido();

  const motivoValido = motivo.trim().length >= 5;
  const bloqueado = ESTAGIOS_BLOQUEADOS.includes(estagio);

  const rootIdExterno = id_externo.replace(/\/C\d+$/, "");
  const cloneIdExternoPreview = `${rootIdExterno}/C01`;

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // Só invalida ao fechar se o cancelamento foi concluído (passo 2)
      // Isso evita que o re-render do pai desmonte o dialog antes do passo 2 aparecer
      if (step === "result") {
        qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
        qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
        qc.invalidateQueries({ queryKey: ["pedido", pedido_id] });
      }
      setMotivo("");
      setStep("confirm");
      setResultado(null);
    }
    setOpen(v);
  };

  const handleConfirmar = async () => {
    if (!motivoValido || bloqueado) return;
    const data = await cancelar.mutateAsync({ pedido_id, motivo: motivo.trim() });
    setResultado({
      titulos_cancelados: data.titulos_cancelados ?? 0,
      boletos_baixa_pendente: data.boletos_baixa_pendente ?? 0,
      valor_credito_pendente: data.valor_credito_pendente ?? 0,
    });
    setStep("result");
  };

  const handleClonar = async () => {
    await clonar.mutateAsync({ pedido_id });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="destructive" className="gap-2 w-full">
          <XCircle className="h-4 w-4" />
          Cancelar pedido
        </Button>
      </DialogTrigger>

      <DialogContent>
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle>Cancelar pedido</DialogTitle>
              <DialogDescription>
                Pedido vai pro estado final "Cancelado". Ação não tem volta.
              </DialogDescription>
            </DialogHeader>

            {bloqueado ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Cancelamento bloqueado. Pedido em estágio{" "}
                  <strong>{estagio}</strong> — NF já emitida. Contate o
                  financeiro para cancelamento fiscal.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label>Motivo (mínimo 5 caracteres)</Label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex: Cliente desistiu · Pagamento não caiu após 3 dias"
                />
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {bloqueado ? "Fechar" : "Voltar"}
              </Button>
              {!bloqueado && (
                <Button
                  variant="destructive"
                  onClick={handleConfirmar}
                  disabled={!motivoValido || cancelar.isPending}
                >
                  {cancelar.isPending ? "Cancelando..." : "Confirmar cancelamento"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "result" && resultado && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Pedido cancelado
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              {resultado.valor_credito_pendente > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>
                      R${" "}
                      {resultado.valor_credito_pendente.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </strong>{" "}
                    em pagamento(s) recebido(s) foram preservados. Crédito do
                    cliente será calculado quando o módulo estiver disponível.
                  </AlertDescription>
                </Alert>
              )}

              {resultado.boletos_baixa_pendente > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{resultado.boletos_baixa_pendente} boleto(s)</strong>{" "}
                    aguardando remessa de baixa. Gere o arquivo em{" "}
                    <strong>Banco Safra → Remessa de Baixa</strong>.
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border p-4 space-y-1">
                <p className="text-sm font-medium">
                  Deseja criar um pedido de substituição?
                </p>
                <p className="text-xs text-muted-foreground">
                  O pedido será recriado como{" "}
                  <strong>{cloneIdExternoPreview}</strong> e voltará à fila de
                  Recebidos. (Número exato confirmado pelo sistema.)
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
              <Button
                onClick={handleClonar}
                disabled={clonar.isPending}
                className="gap-2"
              >
                <CopyPlus className="h-4 w-4" />
                {clonar.isPending ? "Criando substituto..." : "Criar substituto"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
