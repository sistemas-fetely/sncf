import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoFreteReal {
  pedido_id: string;
  frete_cobrado: number | null;
  frete_estimado: number | null;
  estimativa_origem: string | null;
  estimativa_comparavel: boolean | null;
  custo_real: number | null;
  custo_fonte: string | null;
  custo_docs: number | null;
  margem_frete: number | null;
  desvio_estimativa: number | null;
}

export function usePedidoFreteReal(pedidoId: string | undefined) {
  return useQuery<PedidoFreteReal | null>({
    queryKey: ["pedido-frete-real", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_pedido_frete_real")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as PedidoFreteReal | null;
    },
  });
}
