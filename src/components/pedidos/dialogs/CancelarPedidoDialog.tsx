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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, CheckCircle2, CopyPlus, AlertTriangle, Info, Undo2 } from "lucide-react";
import { useCancelarPedido } from "@/hooks/pedidos/useCancelarPedido";
import { useClonarPedido } from "@/hooks/pedidos/useClonarPedido";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  pedido_id: string;
  id_externo: string;
  estagio: string;
  cliente_nome?: string | null;
}

const ESTAGIOS_BLOQUEADOS = ["faturado", "em_transporte", "entregue"];

const brl = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function mensagemErro(e: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  return (
    [err?.message, err?.details, err?.hint].filter(Boolean).join(" · ") ||
    "Erro desconhecido no banco."
  );
}

export function CancelarPedidoDialog({ pedido_id, id_externo, estagio, cliente_nome }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [step, setStep] = useState<"confirm" | "result">("confirm");
  const [devolvendo, setDevolvendo] = useState(false);
  const [devolvido, setDevolvido] = useState(false);
  const [confirmDevolucaoOpen, setConfirmDevolucaoOpen] = useState(false);
  const [motivoDevolucao, setMotivoDevolucao] = useState("");
  const [confirmReverterOpen, setConfirmReverterOpen] = useState(false);
  const [motivoReversao, setMotivoReversao] = useState("");
  const [revertendo, setRevertendo] = useState(false);
  const [resultado, setResultado] = useState<{
    titulos_cancelados: number;
    boletos_baixa_pendente: number;
    valor_credito_pendente: number;
    haver_id: string | null;
  } | null>(null);

  const cancelar = useCancelarPedido();
  const clonar = useClonarPedido();

  const motivoValido = motivo.trim().length >= 5;
  const bloqueado = ESTAGIOS_BLOQUEADOS.includes(estagio);

  const rootIdExterno = id_externo.replace(/\/C\d+$/, "");
  const cloneIdExternoPreview = `${rootIdExterno}/C01`;

  const invalidarCredito = () => {
    qc.invalidateQueries({ queryKey: ["credito-clientes-haveres"] });
    qc.invalidateQueries({ queryKey: ["haver-disponivel"] });
    qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedido_id] });
    qc.invalidateQueries({ queryKey: ["pedido-titulos", pedido_id] });
    qc.invalidateQueries({ queryKey: ["titulos-cobranca"] });
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      // Só invalida ao fechar se o cancelamento foi concluído (passo 2)
      // Isso evita que o re-render do pai desmonte o dialog antes do passo 2 aparecer
      if (step === "result") {
        qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
        qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
        qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedido_id] });
        qc.invalidateQueries({ queryKey: ["pedido-titulos", pedido_id] });
      }
      setMotivo("");
      setStep("confirm");
      setResultado(null);
      setDevolvendo(false);
      setDevolvido(false);
      setMotivoDevolucao("");
      setMotivoReversao("");
      setConfirmDevolucaoOpen(false);
      setConfirmReverterOpen(false);
      setRevertendo(false);
    }
    setOpen(v);
  };

  const handleDevolver = async () => {
    if (!resultado?.haver_id) return;
    if (motivoDevolucao.trim().length < 5) return;
    setDevolvendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("marcar_haver_devolucao", {
        p_haver_id: resultado.haver_id,
        p_motivo: motivoDevolucao.trim(),
      });
      if (error) throw error;
      setDevolvido(true);
      setConfirmDevolucaoOpen(false);
      setMotivoDevolucao("");
      invalidarCredito();
      toast({ title: "Crédito anulado — dinheiro será devolvido ao cliente" });
    } catch (e) {
      toast({
        title: "Não foi possível anular o crédito",
        description: mensagemErro(e),
        variant: "destructive",
      });
    } finally {
      setDevolvendo(false);
    }
  };

  const handleReverterDevolucao = async () => {
    if (!resultado?.haver_id) return;
    if (motivoReversao.trim().length < 5) return;
    setRevertendo(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("reverter_haver_devolucao", {
        p_haver_id: resultado.haver_id,
        p_motivo: motivoReversao.trim(),
      });
      if (error) throw error;
      setDevolvido(false);
      setConfirmReverterOpen(false);
      setMotivoReversao("");
      invalidarCredito();
      toast({ title: "Devolução desfeita — crédito restaurado" });
    } catch (e) {
      toast({
        title: "Não foi possível desfazer a devolução",
        description: mensagemErro(e),
        variant: "destructive",
      });
    } finally {
      setRevertendo(false);
    }
  };

  const handleConfirmar = async () => {
    if (!motivoValido || bloqueado) return;
    const data = await cancelar.mutateAsync({ pedido_id, motivo: motivo.trim() });
    setResultado({
      titulos_cancelados: data.titulos_cancelados ?? 0,
      boletos_baixa_pendente: data.boletos_baixa_pendente ?? 0,
      valor_credito_pendente: data.valor_credito_pendente ?? 0,
      haver_id: data.haver_id ?? null,
    });
    setStep("result");
  };

  const handleClonar = async () => {
    await clonar.mutateAsync({ pedido_id });
    setOpen(false);
  };

  const valorCredito = resultado?.valor_credito_pendente ?? 0;

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
              {valorCredito > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{brl(valorCredito)}</strong> em pagamento(s) recebido(s) viraram
                    haver do cliente (disponível por 180 dias).
                    {devolvido ? (
                      <div className="mt-2 space-y-2">
                        <p className="text-sm text-destructive font-medium">
                          Crédito anulado — o valor será devolvido ao cliente por fora do
                          sistema.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setConfirmReverterOpen(true)}
                        >
                          <Undo2 className="h-4 w-4" />
                          Desfazer devolução
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => setConfirmDevolucaoOpen(true)}
                        >
                          Não gerar crédito — dinheiro será devolvido
                        </Button>
                      </div>
                    )}
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

      {/* Confirmação destrutiva: anular o crédito */}
      <AlertDialog open={confirmDevolucaoOpen} onOpenChange={setConfirmDevolucaoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular o crédito do cliente?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="text-2xl font-bold text-destructive">{brl(valorCredito)}</p>
                {cliente_nome && (
                  <p className="text-sm">
                    Cliente: <strong>{cliente_nome}</strong>
                  </p>
                )}
                <p>
                  O crédito de <strong>{brl(valorCredito)}</strong> deixa de existir. O
                  cliente <strong>não</strong> poderá usar esse valor em pedidos futuros — o
                  dinheiro deve ser devolvido a ele por fora do sistema.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label>Motivo da devolução (mínimo 5 caracteres) *</Label>
            <Textarea
              value={motivoDevolucao}
              onChange={(e) => setMotivoDevolucao(e.target.value)}
              placeholder="Ex: Cliente pediu estorno via PIX"
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={devolvendo}>Manter crédito</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDevolver();
              }}
              disabled={motivoDevolucao.trim().length < 5 || devolvendo}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {devolvendo ? "Anulando..." : `Anular crédito de ${brl(valorCredito)}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação: desfazer a devolução */}
      <AlertDialog open={confirmReverterOpen} onOpenChange={setConfirmReverterOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer a devolução?</AlertDialogTitle>
            <AlertDialogDescription>
              O crédito de <strong>{brl(valorCredito)}</strong> volta a ficar disponível para
              o cliente. Use isto quando a devolução foi marcada por engano.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label>Motivo da reversão (mínimo 5 caracteres) *</Label>
            <Textarea
              value={motivoReversao}
              onChange={(e) => setMotivoReversao(e.target.value)}
              placeholder="Ex: Clique errado, cliente vai usar o crédito"
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={revertendo}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReverterDevolucao();
              }}
              disabled={motivoReversao.trim().length < 5 || revertendo}
            >
              {revertendo ? "Desfazendo..." : "Desfazer devolução"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
