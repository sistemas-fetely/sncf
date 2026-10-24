import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TituloEixos {
  id: string;
  numero_parcela: number | null;
  eixo_prova: string | null;
  eixo_status: string | null;
  data_vencimento_atual: string | null;
  data_liquidacao_prevista: string | null;
}

/**
 * Eixos (prova/status) das parcelas de um pedido, lidos de vw_titulos_cobranca.
 * Hook independente — não toca no useTitulosCobranca.
 * Retorna um mapa por id de título para casar com a lista de parcelas.
 */
export function useTituloEixosPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["titulo-eixos-pedido", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<string, TituloEixos>> => {
      if (!pedidoId) return {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_titulos_cobranca")
        .select(
          "id, numero_parcela, eixo_prova, eixo_status, data_vencimento_atual, data_liquidacao_prevista",
        )
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      const linhas = (data ?? []) as TituloEixos[];
      return Object.fromEntries(linhas.map((l) => [l.id, l]));
    },
  });
}
