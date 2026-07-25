import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAvaliarImpactoEdicao } from "@/hooks/credito/useAvaliarImpactoEdicao";
import { useReabrirAnalisePedido } from "@/hooks/pedidos/useReabrirAnalisePedido";

interface Props {
  pedidoId: string | null | undefined;
  novaCondicao: string | null | undefined;
  novoValorLiquido?: number | null;
  enabled?: boolean;
  className?: string;
  onSuccess?: () => void;
}

/**
 * Botão "Reabrir análise de crédito" — só aparece quando o
 * ImpactoEdicaoBanner indicaria caminho='re_analise'. Ação diferente
 * do "Reanalisar" do CardAnalisePedido (que checa o programa comercial).
 */
export function ReabrirAnaliseAction({
  pedidoId,
  novaCondicao,
  novoValorLiquido,
  enabled = true,
  className,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  const impacto = useAvaliarImpactoEdicao({
    pedidoId,
    novaCondicao,
    novoValorLiquido,
    enabled,
  });

  const reabrir = useReabrirAnalisePedido();

  if (!enabled || !pedidoId) return null;
  if (impacto.error || !impacto.data) return null;
  if (impacto.data.caminho !== "re_analise") return null;

  async function handleConfirmar() {
    if (!pedidoId) return;
    try {
      await reabrir.mutateAsync({ pedidoId, motivo: motivo.trim() });
      setOpen(false);
      setMotivo("");
      onSuccess?.();
    } catch {
      // toast já tratado no hook
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="h-4 w-4 mr-1.5 text-amber-600" />
        Reabrir análise de crédito
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && !reabrir.isPending && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir análise de crédito</DialogTitle>
            <DialogDescription>
              Uma nova análise de crédito será criada e o pedido voltará para{" "}
              <strong>em análise de crédito</strong>. Use isso quando a nova
              condição estourar o limite/prazo aprovados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="motivo-reabrir">Motivo</Label>
            <Textarea
              id="motivo-reabrir"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: cliente pediu prazo maior; valor acima do limite aprovado…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={reabrir.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmar}
              disabled={reabrir.isPending || motivo.trim().length < 3}
            >
              {reabrir.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar reanálise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
