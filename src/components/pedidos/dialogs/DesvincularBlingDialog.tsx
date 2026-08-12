import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Link2Off, AlertTriangle } from "lucide-react";
import { useDesvincularBling } from "@/hooks/pedidos/useDesvincularBling";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pedidoId: string;
  idExterno: string;
  blingId?: string | number | null;
}

export function DesvincularBlingDialog({ open, onOpenChange, pedidoId, idExterno, blingId }: Props) {
  const [motivo, setMotivo] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const desvincular = useDesvincularBling();

  const motivoOk = motivo.trim().length >= 10;

  const fechar = (v: boolean) => {
    if (desvincular.isPending) return;
    if (!v) { setMotivo(""); setConfirmado(false); }
    onOpenChange(v);
  };

  const handleDesvincular = async () => {
    if (!motivoOk) return;
    try {
      await desvincular.mutateAsync({
        pedido_id: pedidoId,
        motivo: motivo.trim(),
        confirmado_no_bling: confirmado,
      });
      setMotivo("");
      setConfirmado(false);
      onOpenChange(false);
    } catch {
      // toast destrutivo já emitido no hook; diálogo fica aberto para nova tentativa
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2Off className="h-4 w-4" />
            Desvincular envio ao Bling — {idExterno}
          </DialogTitle>
          <DialogDescription>
            O SNCF vai esquecer o vínculo com o pedido {blingId ?? "—"} no Bling. As remessas enviadas
            são canceladas (o id do Bling fica guardado na observação e na timeline). Isso NÃO exclui
            nada no Bling — se o pedido ainda existir lá, exclua manualmente para não duplicar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Motivo (fica na timeline)
          </label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: envio revertido manualmente no Bling após erro de forma de pagamento"
            className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {motivo.trim().length > 0 && !motivoOk && (
            <p className="text-[10px] text-destructive">Mínimo de 10 caracteres.</p>
          )}
        </div>

        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <Checkbox
            checked={confirmado}
            onCheckedChange={(v) => setConfirmado(v === true)}
            className="mt-0.5"
          />
          <span>Já excluí este pedido no Bling</span>
        </label>

        {!confirmado && (
          <Alert className="border-amber-500/50 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Sem essa confirmação, o pedido pode seguir vivo no Bling e virar duplicidade num reenvio.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => fechar(false)} disabled={desvincular.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={!motivoOk || desvincular.isPending} onClick={handleDesvincular}>
            {desvincular.isPending ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Desvinculando…</>
            ) : (
              "Desvincular"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
