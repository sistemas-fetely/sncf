import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PipelineItem } from "@/types/pedido";

export function usePedidosPipeline() {
  return useQuery({
    queryKey: ["pedidos-pipeline"],
    staleTime: 30 * 1000,
    // Os cards ficam montados (sticky) e nunca remontavam: congelavam enquanto
    // a lista rebuscava a cada clique. Daí refetch por tempo e por foco.
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PipelineItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("v_pedidos_pipeline")
        .select("*");
      if (error) throw error;
      return (data || []) as PipelineItem[];
    },
  });
}
