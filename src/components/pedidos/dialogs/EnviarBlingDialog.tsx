import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, Loader2, AlertTriangle, RefreshCw, Package } from "lucide-react";
import { useEnviarBling } from "@/hooks/pedidos/useEnviarBling";
import { useSyncContato } from "@/hooks/parceiros/useSyncContato";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  pedido_id: string;
  parceiro_id: string;
  id_externo: string;
  valor_liquido: number;
  forma_solicitada: string;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function EnviarBlingDialog({
  pedido_id, parceiro_id, id_externo, valor_liquido, forma_solicitada,
}: Props) {
  const [open, setOpen] = useState(false);
  const enviar = useEnviarBling();
  const sync = useSyncContato();

  const { data: parceiroStatus, isLoading: checkingBling, refetch: recheckBling } = useQuery({
    queryKey: ["parceiro-bling-check", parceiro_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("bling_id")
        .eq("id", parceiro_id)
        .maybeSingle();
      return data;
    },
    enabled: open && !!parceiro_id,
  });

  const { data: remessasAtivas, isLoading: checkingRemessas } = useQuery({
    queryKey: ["remessas-ativas-check", pedido_id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("pedido_remessa")
        .select("id, sequencia, status")
        .eq("pedido_id", pedido_id)
        .eq("status", "pronta_para_envio")
        .is("bling_pedido_id", null);
      return data ?? [];
    },
    enabled: open,
  });

  const temBlingId = !!parceiroStatus?.bling_id;
  const temRemessaAtiva = Array.isArray(remessasAtivas) && remessasAtivas.length > 0;
  const carregando = checkingBling || checkingRemessas;

  const handleSincronizar = async () => {
    try {
      await sync.mutateAsync(parceiro_id);
      recheckBling();
    } catch {
      // erro tratado no hook
    }
  };

  const handleEnviar = async () => {
    try {
      await enviar.mutateAsync({ pedido_id });
      setOpen(false);
    } catch {
      // erro tratado no hook
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

        {carregando ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verificando pedido...
          </div>
        ) : temRemessaAtiva ? (
          <Alert>
            <Package className="h-4 w-4" />
            <AlertDescription>
              Este pedido já tem {remessasAtivas!.length === 1 ? "1 remessa ativa" : `${remessasAtivas!.length} remessas ativas`} aguardando envio.
              Feche este diálogo e role a página até a seção <strong>Remessas</strong> para enviá-la ao Bling.
            </AlertDescription>
          </Alert>
        ) : !temBlingId ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Parceiro ainda não sincronizado no Bling. Sincronize antes de enviar o pedido.
              </AlertDescription>
            </Alert>
            <Button
              onClick={handleSincronizar}
              disabled={sync.isPending}
              className="w-full gap-1.5"
            >
              {sync.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Sincronizando...</>
              ) : (
                <><RefreshCw className="h-4 w-4" />Sincronizar parceiro no Bling</>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Ao confirmar, o pedido será criado no Bling com seus títulos a receber.
              Esta ação é irreversível dentro do sistema (depois precisa cancelar lá direto).
            </p>
            <p className="text-xs">
              Se faltar alguma informação (forma sem id Bling parametrizado),
              o envio falha com mensagem clara e nada é alterado no pedido.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={enviar.isPending || sync.isPending}
          >
            Cancelar
          </Button>
          {temBlingId && !temRemessaAtiva && (
            <Button onClick={handleEnviar} disabled={enviar.isPending} className="gap-1.5">
              {enviar.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Enviando…</>
              ) : (
                <><Send className="h-4 w-4" />Confirmar envio</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
