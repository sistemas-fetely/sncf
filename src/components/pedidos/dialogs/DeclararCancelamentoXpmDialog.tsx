import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Loader2, Ban } from "lucide-react";
import { useDeclararCancelamentoXpm } from "@/hooks/pedidos/useDeclararCancelamentoXpm";

const MIN_MOTIVO = 15;

interface Props {
  pedidoId: string;
  expedicaoCodigo: string;
}

/**
 * A integracao ZenLOG nao informa cancelamento: quem cancela e a XPM, por fora.
 * Aqui o operador DECLARA, com autor e motivo. A RPC valida o resto.
 */
export function DeclararCancelamentoXpmDialog({ pedidoId, expedicaoCodigo }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const declarar = useDeclararCancelamentoXpm();

  const valido = motivo.trim().length >= MIN_MOTIVO;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMotivo(""); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2 text-muted-foreground"
        >
          <Ban className="h-3.5 w-3.5 shrink-0" />
          Declarar que a XPM cancelou
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Declarar cancelamento na XPM</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              A ZenLOG não informa cancelamento pela integração, então isto é uma
              declaração registrada em nome de quem clicar.
            </span>
            <span className="block">
              Ao confirmar, a expedição{" "}
              <span className="tabular-nums">{expedicaoCodigo}</span> deixa de
              apontar para este pedido e ele volta para{" "}
              <strong>Pré-Separação</strong>, onde pode ser editado e empurrado
              de novo.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Selo estado="warning">Declaração humana</Selo>
          <Label htmlFor="motivo-cancel-xpm" className="text-xs">
            Motivo (fica registrado no histórico do pedido)
          </Label>
          <Textarea
            id="motivo-cancel-xpm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: XPM confirmou cancelamento por e-mail em 18/08, carga não separada"
          />
          <p className="text-xs text-muted-foreground tabular-nums">
            {motivo.trim().length}/{MIN_MOTIVO} caracteres mínimos
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!valido || declarar.isPending}
            onClick={async () => {
              try {
                await declarar.mutateAsync({
                  pedido_id: pedidoId,
                  expedicao_codigo: expedicaoCodigo,
                  motivo: motivo.trim(),
                });
                setOpen(false);
                setMotivo("");
              } catch { /* toast de erro sai do hook; dialog fica aberto */ }
            }}
          >
            {declarar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Declarando…</>
            ) : (
              "Declarar cancelamento"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
