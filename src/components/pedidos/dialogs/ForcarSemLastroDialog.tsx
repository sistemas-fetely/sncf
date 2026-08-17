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
  faltantes: string[];
  onForcar: (motivo: string) => void;
  isPending: boolean;
  onDividirRemessa?: () => void;
}

/**
 * Diálogo de override para a guarda de lastro da pré-separação.
 * Reutilizável: usado no detalhe do pedido, no transicionador e na triagem.
 */
export function ForcarSemLastroDialog({
  open,
  onOpenChange,
  faltantes,
  onForcar,
  isPending,
  onDividirRemessa,
}: Props) {
  const [motivo, setMotivo] = useState("");

  const fechar = () => {
    setMotivo("");
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) fechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sem lastro para pré-separação</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                A reserva de estoque nasce na pré-separação. O pedido não pode descer porque
                falta disponível para os itens abaixo.
              </p>
              {faltantes.length > 0 && (
                <ul className="rounded-md bg-muted/50 border p-3 space-y-1 text-xs">
                  {faltantes.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              <p>
                {onDividirRemessa ? (
                  <>
                    O caminho recomendado é <strong>dividir a remessa</strong>, mandando só o que tem lastro.
                    Se ainda assim quiser forçar, explique o motivo — ele fica{" "}
                    <strong>registrado no histórico do pedido</strong>.
                  </>
                ) : (
                  <>
                    Se ainda assim quiser forçar, explique o motivo — ele fica{" "}
                    <strong>registrado no histórico do pedido</strong>.
                  </>
                )}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <Label>Motivo (obrigatório)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que descer sem lastro?"
            rows={3}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          {onDividirRemessa && (
            <Button
              variant="outline"
              disabled={isPending}
              onClick={() => { fechar(); onDividirRemessa(); }}
            >
              <Scissors className="h-4 w-4 mr-1.5" />
              Dividir remessa
            </Button>
          )}
          <AlertDialogAction
            className={cn(
              "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
            disabled={!motivo.trim() || isPending}
            onClick={(e) => {
              e.preventDefault();
              onForcar(motivo.trim());
              setMotivo("");
            }}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Forçar mesmo assim
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
