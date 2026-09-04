import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Selo } from "@/components/ui/selo";
import { Loader2, ShieldAlert } from "lucide-react";
import { useEmpurrarXpm } from "@/hooks/pedidos/useEmpurrarXpm";

const MIN_MOTIVO = 15;

interface Props {
  pedidoId: string;
}

/**
 * Caminho de OVERRIDE do empurrão XPM: só aparece quando a XPM já tem
 * expedição para o pedido. Motivo obrigatório — fica no histórico.
 */
export function ForcarXpmDialog({ pedidoId }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const empurrar = useEmpurrarXpm();
  // OVERRIDE-TEM-NOME: permissão própria do override de expedição existente.
  const { permitido: podeForcar } = usePermissaoAcaoOuSuperAdmin("acao.forcar_expedicao_xpm");

  const valido = motivo.trim().length >= MIN_MOTIVO;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setMotivo(""); }}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          disabled={!podeForcar}
          title={podeForcar ? undefined : "Ação de gerente"}
          className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2 text-muted-foreground"
        >
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          {podeForcar ? "Forçar envio mesmo assim" : "Forçar envio mesmo assim — Ação de gerente"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forçar empurrão sobre expedição existente</DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">
              A XPM já tem uma expedição para este pedido. Continuar cria um
              segundo documento no armazém, e só a XPM pode cancelá-lo.
            </span>
            <span className="block">
              Use esta saída apenas quando a expedição anterior já foi cancelada
              do lado deles.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Selo estado="warning">Ação de exceção</Selo>
          <Label htmlFor="motivo-forcar-xpm" className="text-xs">
            Motivo (fica registrado no histórico do pedido)
          </Label>
          <Textarea
            id="motivo-forcar-xpm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: expedição anterior cancelada pela XPM em 18/08, confirmado por e-mail"
          />
          <p className="text-xs text-muted-foreground">
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
            disabled={!valido || empurrar.isPending}
            onClick={async () => {
              try {
                await empurrar.mutateAsync({
                  pedido_id: pedidoId,
                  forcar: true,
                  motivo: motivo.trim(),
                });
                setOpen(false);
                setMotivo("");
              } catch { /* toast de erro já sai do hook */ }
            }}
          >
            {empurrar.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Forçando…</>
            ) : (
              "Forçar empurrão"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
