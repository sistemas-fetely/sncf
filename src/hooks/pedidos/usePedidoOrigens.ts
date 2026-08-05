import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoOrigem {
  pedido_id: string;
  origem_pedido_id: string;
  origem_id_externo: string;
  origem_split_de_pedido_id: string | null;
  origem_venda_id_externo: string | null;
  consolidado_em: string | null;
  itens: number;
  valor_bruto_itens: number;
}

/**
 * Pedidos absorvidos por este pedido via consolidar_split_pedido.
 * Fonte: view vw_pedido_origens (procedencia vem de pedido_itens.origem_pedido_id).
 */
export function usePedidoOrigens(pedido_id: string) {
  return useQuery({
    queryKey: ["pedido-origens", pedido_id],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_origens")
        .select("*")
        .eq("pedido_id", pedido_id);
      if (error) throw error;
      return (data ?? []) as PedidoOrigem[];
    },
    enabled: !!pedido_id,
  });
}
