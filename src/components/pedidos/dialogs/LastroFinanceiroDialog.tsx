import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  falta: string | null;
  classe: string | null;
  classeMotivo: string | null;
  caminho: string | null;
  isPending: boolean;
  /** Nível 4+; quando false, o botão de forçar não é renderizado. */
  podeForcar: boolean;
  onReenviarAnalise: (motivo: string) => void;
  onDividirPedido: () => void;
  onForcar: (motivo: string) => void;
}

/**
 * Guarda de lastro FINANCEIRO da pré-separação (PED-2202). Irmã do
 * ForcarSemLastroDialog (lastro físico de SKU) — não compartilham estado.
 * O caminho recomendado é reenviar para análise de crédito; forçar exige alçada.
 */
export function LastroFinanceiroDialog({
  open,
  onOpenChange,
  falta,
  classe,
  classeMotivo,
  caminho,
  isPending,
  podeForcar,
  onReenviarAnalise,
  onDividirPedido,
  onForcar,
}: Props) {
  const [motivo, setMotivo] = useState("");

  const motivoOk = motivo.trim().length >= 3;

  const fechar = () => {
    setMotivo("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) fechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sem lastro financeiro para a pré-separação</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                A reserva de mercadoria nasce na pré-separação. O pedido não desce
                sem dinheiro em conta ou crédito aprovado.
              </p>
              <div className="rounded-md bg-muted/50 border p-3 space-y-1 text-xs">
                {falta && (
                  <p>
                    Falta <strong>{falta}</strong> de cobertura.
                  </p>
                )}
                {classe === "portao" && (
                  <p>
                    Cliente sem limite de crédito aprovado
                    {classeMotivo ? ` (motivo: ${classeMotivo})` : ""}.
                  </p>
                )}
              </div>
              {caminho && (
                <p className="text-xs">
                  <strong>Caminhos possíveis:</strong> {caminho}.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Caminho recomendado quando o cliente não tem limite: reenviar para
                análise de crédito.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label>Motivo (obrigatório para reenviar ou forçar)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que reenviar ou forçar a descida?"
            rows={3}
          />
        </div>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            disabled={!motivoOk || isPending}
            onClick={() => onReenviarAnalise(motivo.trim())}
            className="w-full"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Reenviar para análise de crédito
          </Button>

          <Button
            variant="outline"
            disabled={isPending}
            className="w-full"
            onClick={() => { fechar(); onDividirPedido(); }}
          >
            <Scissors className="h-4 w-4 mr-1.5" />
            Dividir pedido
          </Button>

          {podeForcar && (
            <div className="w-full space-y-1">
              <AlertDialogAction
                className={cn(
                  "w-full bg-destructive text-destructive-foreground hover:bg-destructive/90",
                )}
                disabled={!motivoOk || isPending}
                onClick={(e) => {
                  e.preventDefault();
                  onForcar(motivo.trim());
                  setMotivo("");
                }}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Forçar mesmo assim
              </AlertDialogAction>
              <p className="text-xs text-muted-foreground">
                A exposição fica registrada como empenho por decisão de alçada no
                histórico do pedido.
              </p>
            </div>
          )}

          <AlertDialogCancel disabled={isPending} className="w-full">
            Cancelar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
