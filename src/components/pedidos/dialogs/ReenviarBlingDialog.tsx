import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Loader2, RotateCcw, AlertTriangle } from "lucide-react";
import { useReenviarBling, ReenvioPrecisaConfirmacao } from "@/hooks/pedidos/useReenviarBling";

interface Props {
  pedidoId: string;
  idExterno: string;
  blingIdAtual: string;
}

/**
 * Reenvio ao Bling — só super_admin, só em_separacao (a gate fica em AcoesRemessa).
 * Pressupõe que o pedido JÁ foi cancelado no Bling. A edge verifica a situação lá
 * e, se não estiver cancelado (ou se não conseguir verificar), exige confirmação
 * explícita antes de prosseguir. SISTEMA SUGERE / HUMANO DECIDE.
 */
export function ReenviarBlingDialog({ pedidoId, idExterno, blingIdAtual }: Props) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<{ texto: string; situacao: string } | null>(null);
  const reenviar = useReenviarBling();

  const fechar = (v: boolean) => {
    setOpen(v);
    if (!v) { setMotivo(""); setAviso(null); }
  };

  const disparar = async (confirmar: boolean) => {
    try {
      await reenviar.mutateAsync({ pedido_id: pedidoId, motivo: motivo.trim(), confirmar_nao_cancelado: confirmar });
      fechar(false);
    } catch (e) {
      if (e instanceof ReenvioPrecisaConfirmacao) {
        setAviso({ texto: e.message, situacao: e.situacaoAtual });
        return;
      }
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
            Cancela a tentativa atual (id Bling <strong>{blingIdAtual}</strong>) e cria uma nova, que vai ao Bling na hora.
            O id antigo fica guardado no histórico. <strong>Use só depois de cancelar o pedido no Bling.</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="motivo-reenvio">Motivo (obrigatório)</Label>
          <Textarea
            id="motivo-reenvio"
            value={motivo}
            onChange={(e) => { setMotivo(e.target.value); setAviso(null); }}
            placeholder="Ex.: item com preço errado no Bling — cancelado lá para reenviar corrigido"
            rows={3}
          />
        </div>

        {aviso && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs leading-relaxed">
              {aviso.texto}
              <br />
              <span className="font-medium">Situação no Bling: {aviso.situacao}</span>
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => fechar(false)} disabled={reenviar.isPending}>Cancelar</Button>
          {aviso ? (
            <Button variant="destructive" disabled={reenviar.isPending} onClick={() => disparar(true)}>
              {reenviar.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Reenviando…</> : "Reenviar assim mesmo"}
            </Button>
          ) : (
            <Button disabled={reenviar.isPending || motivo.trim().length === 0} onClick={() => disparar(false)}>
              {reenviar.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Reenviando…</> : "Reenviar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
