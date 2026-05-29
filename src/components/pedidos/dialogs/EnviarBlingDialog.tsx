import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";

interface Props {
  pedido_id: string;
  id_externo: string;
  valor_liquido: number;
  forma_solicitada: string;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function EnviarBlingDialog({
  pedido_id, id_externo, valor_liquido, forma_solicitada,
}: Props) {
  const [open, setOpen] = useState(false);
  const enviar = useEnviarBling();

  const handleEnviar = async () => {
    try {
      await enviar.mutateAsync(pedido_id);
      setOpen(false);
    } catch {
      // erro já tratado no hook (toast)
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!enviar.isPending) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Send className="h-4 w-4" />
          Enviar pro Bling
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar pedido pro Bling</DialogTitle>
          <DialogDescription>
            Pedido <strong>#{id_externo}</strong> · {fmtBRL.format(valor_liquido)} · {forma_solicitada}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Ao confirmar, o pedido será criado no Bling com seus títulos a receber.
            Esta ação é irreversível dentro do sistema (depois precisa cancelar lá direto).
          </p>
          <p className="text-xs">
            Se faltar alguma informação (parceiro sem bling_id, forma sem id Bling parametrizado),
            o envio falha com mensagem clara e nada é alterado no pedido.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={enviar.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleEnviar} disabled={enviar.isPending} className="gap-1.5">
            {enviar.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Confirmar envio
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
