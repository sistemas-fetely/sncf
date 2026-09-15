import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * PROBLEMA-E-CHAMADO (15/09/2026): problema de pedido virou chamado.
 * `pedido_problema` está congelada e a RPC `fn_pedido_libera_refaturamento`
 * agora lê chamados — mesma assinatura, mesmo shape.
 */

/**
 * BOTÃO-SEGUE-O-CHAMADO: a tela NÃO repete a regra de refaturamento.
 * A RPC é a fonte única — a edge function `enviar-pedido-bling` lê a mesma.
 */
export function useLiberaRefaturamento(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-libera-refaturamento", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<{ libera: boolean; porque: string | null }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_pedido_libera_refaturamento", {
        p_pedido_id: pedidoId,
      });
      if (error) throw new Error(error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const j = (data ?? {}) as any;
      return { libera: j.libera === true, porque: j.porque ?? null };
    },
  });
}
