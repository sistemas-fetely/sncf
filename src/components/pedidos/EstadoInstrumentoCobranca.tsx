import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Linha de ESTADO do instrumento de cobrança do portão provisório.
 * Doutrina: o ATO de criar instrumento mora na tela de Cobrança;
 * o detalhe do pedido apenas exibe estado. Sem botões de ação aqui.
 */
export function EstadoInstrumentoCobranca({ pedidoId }: { pedidoId: string }) {
  const q = useQuery({
    queryKey: ["estado-instrumento-portao", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedido_portao")
        .select("id, pix_txid")
        .eq("pedido_id", pedidoId)
        .eq("status", "provisorio")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; pix_txid: string | null } | null;
    },
  });

  if (q.isLoading || !q.data) return null;

  const txid = q.data.pix_txid;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2 text-xs">
      {txid ? (
        <span className="text-muted-foreground">
          QR PIX gerado · identificador <span className="font-mono">{txid}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Sem instrumento de cobrança</span>
      )}
      <Link
        to={`/recebimento/cobranca/${pedidoId}`}
        className="text-primary underline underline-offset-2 hover:no-underline"
      >
        Abrir Cobrança
      </Link>
    </div>
  );
}
