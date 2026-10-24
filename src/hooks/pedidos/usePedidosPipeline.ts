import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PipelineItem } from "@/types/pedido";

export function usePedidosPipeline() {
  return useQuery({
    queryKey: ["pedidos-pipeline"],
    // Os cards ficam montados (sticky) e nunca remontavam: congelavam enquanto
    // a lista rebuscava a cada clique. Daí refetch por tempo.
    // CUSTO-DA-VIEW (09/09/2026): v_pedidos_pipeline custa ~1s; a cada minuto,
    // somada ao foco da janela, virava a consulta mais pesada do dia.
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
