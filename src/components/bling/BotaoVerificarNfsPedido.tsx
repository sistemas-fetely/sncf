import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVerificarNfBling } from "@/hooks/bling/useVerificarNfBling";

/** Busca no Bling as NFs do pedido de venda e aplica no SNCF. */
export function BotaoVerificarNfsPedido({ pedidoBlingId }: { pedidoBlingId: string }) {
  const m = useVerificarNfBling();
  return (
    <Button type="button" size="sm" variant="outline" className="mt-2 h-7 gap-1 text-xs" disabled={m.isPending}
      onClick={() => m.mutate({ pedido_bling_id: pedidoBlingId })}>
      {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
      Verificar NFs no Bling agora
    </Button>
  );
}
