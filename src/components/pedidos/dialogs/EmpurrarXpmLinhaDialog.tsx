import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Warehouse, AlertTriangle } from "lucide-react";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";
import { usePreviaEmpurrarXpm } from "@/hooks/pedidos/usePreviaEmpurrarXpm";
import { ForcarXpmDialog } from "@/components/pedidos/dialogs/ForcarXpmDialog";

interface Props {
  pedido_id: string;
  id_externo: string;
  xpm_envio_erro?: string | null;
  /** "resgate" (default) = pedido já está no Bling e ficou sem expedição.
   *  "normal" = fluxo padrão: XPM primeiro, Bling depois do pré-faturamento. */
  modo?: "resgate" | "normal";
}

/**
 * Resgate da fila (21/08/2026): pedido que já foi pro Bling e ficou sem
 * expedição na XPM. Só empurra pra XPM — o Bling já tem o pedido.
 */
export function EmpurrarXpmLinhaDialog({ pedido_id, id_externo, xpm_envio_erro, modo = "resgate" }: Props) {
  const [open, setOpen] = useState(false);
  const empurrarXpm = useEmpurrarXpm();
  const { data: previa, isLoading: checkingPrevia } = usePreviaEmpurrarXpm(pedido_id, open);

  const bloqueios = previa?.bloqueios ?? [];
  const avisos = previa?.avisos ?? [];
  const jaExisteNaXpm = !!xpm_envio_erro && String(xpm_envio_erro).includes("Expedicao ja existe na XPM");

  const handleConfirmar = async () => {
    try {
      await empurrarXpm.mutateAsync({ pedido_id });
      setOpen(false);
    } catch {
      // FAIL-LOUD: o toast de erro já sai de dentro do hook.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (empurrarXpm.isPending) return;
        setOpen(v);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title="Empurrar pra XPM"
          aria-label="Empurrar pra XPM"
        >
          <Warehouse className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empurrar pra XPM</DialogTitle>
          <DialogDescription>
            Pedido <strong>#{id_externo}</strong> · {modo === "normal"
              ? "Empurrar pra XPM. O Bling recebe depois que a expedição for conferida — no pré-faturamento."
              : "Este pedido já está no Bling, mas não tem expedição na XPM."}
          </DialogDescription>
        </DialogHeader>

        {checkingPrevia ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando pedido...
          </div>
        ) : (
          <div className="space-y-3">
            {xpm_envio_erro && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>XPM recusou: {xpm_envio_erro}</AlertDescription>
              </Alert>
            )}
            {bloqueios.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="space-y-1">
                  {bloqueios.map((b) => (
                    <p key={b}>{b}</p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            {/* FOTO-NAO-BARRA (18/08/2026): saldo insuficiente na XPM avisa, nao barra. */}
            {avisos.length > 0 && (
              <Alert variant="default" className="bg-warning/10 border-warning/40">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-warning text-xs space-y-1">
                  {avisos.map((a) => (
                    <p key={a} className="tabular-nums">{a}</p>
                  ))}
                  <p className="text-muted-foreground">
                    A posição da XPM é uma foto do fim do dia anterior: entrada recente
                    pode ainda não aparecer. Pode enviar — se realmente faltar, o
                    armazém corta o item.
                  </p>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={empurrarXpm.isPending}
          >
            Cancelar
          </Button>
          {jaExisteNaXpm ? (
            <ForcarXpmDialog pedidoId={pedido_id} />
          ) : (
            <Button
              onClick={handleConfirmar}
              disabled={empurrarXpm.isPending || checkingPrevia || bloqueios.length > 0}
              className="gap-1.5"
            >
              {empurrarXpm.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Empurrando…</>
              ) : (
                <><Warehouse className="h-4 w-4" />Confirmar envio</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
