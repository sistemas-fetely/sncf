import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PropostaCobranca } from "@/types/credito";

export function usePropostaCobranca(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["cobranca-proposta", pedidoId],
    enabled: !!pedidoId,
    staleTime: 5 * 60 * 1000,
    // Refetch por foco de janela apagava a composição manual do operador.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PropostaCobranca> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("propor_cobranca", {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      return data as PropostaCobranca;
    },
  });
}
