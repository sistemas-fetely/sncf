import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { useReenviarBling } from "@/hooks/pedidos/useReenviarBling";
import { usePermissaoAcaoOuSuperAdmin } from "@/hooks/usePermissaoAcao";
import { useNivel } from "@/hooks/useNivel";
import { rawMessage } from "@/lib/format-error";

interface Props {
  pedidoId: string;
  idExterno: string;
  blingIdAtual: string;
}

/**
 * Reenvio humano: a conferência no Bling é obrigatória e não admite override.
 */
export function ReenviarBlingDialog({ pedidoId, idExterno, blingIdAtual }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const reenviar = useReenviarBling();
  const { permitido } = usePermissaoAcaoOuSuperAdmin("acao.enviar_bling");
  const { temNivel } = useNivel();
  if (!permitido || !temNivel(2)) return null;

  const fechar = (v: boolean) => {
    if (reenviar.isPending) return;
    setOpen(v);
    if (!v) { setMotivo(""); setAviso(null); }
  };

  const disparar = async () => {
    try {
      await reenviar.mutateAsync({ pedido_id: pedidoId, motivo: motivo.trim() });
      fechar(false);
    } catch (e) {
      setAviso(rawMessage(e));
      // erro real: o hook já mostrou o toast; mantém o diálogo aberto pra nova tentativa
    }
  };

  return (
    <Dialog open={open} onOpenChange={fechar}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full gap-1.5 whitespace-normal h-auto text-xs leading-tight py-2">
          <RotateCcw className="h-3.5 w-3.5 shrink-0" />
          Reenviar ao Bling
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reenviar {idExterno} ao Bling</DialogTitle>
          <DialogDescription>
            O SNCF vai conferir no Bling se o pedido <strong>{blingIdAtual}</strong> está cancelado ou excluído e se não tem NF viva.
            Só depois cria o novo envio. O id antigo fica no histórico. Cancele no Bling primeiro.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo-reenvio">Motivo (mínimo 10 caracteres)</Label>
          <Textarea
            id="motivo-reenvio"
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); setAviso(null); }}
            placeholder="Ex.: item com preço errado no Bling — cancelado lá para reenviar corrigido"
            rows={3}
            disabled={reenviar.isPending}
          />
        </div>

        {aviso && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed">
              {aviso}
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => fechar(false)} disabled={reenviar.isPending}>Cancelar</Button>
          <Button disabled={reenviar.isPending || motivo.trim().length < 10} onClick={() => void disparar()}>
            {reenviar.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Conferindo e reenviando…</> : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
