import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePedidoPortaoProvisorio(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-portao-provisorio", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_portao")
        .select("id")
        .eq("pedido_id", pedidoId!)
        .eq("status", "provisorio")
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
  });
}
