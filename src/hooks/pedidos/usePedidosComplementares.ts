import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePedidosComplementares(pedido_id: string) {
  return useQuery({
    queryKey: ["pedidos-complementares", pedido_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pedidos")
        .select("id, id_externo, valor_liquido, estagio, parceiro_id")
        .eq("pedido_origem_id", pedido_id)
        .order("recebido_em");
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!pedido_id,
  });
}
