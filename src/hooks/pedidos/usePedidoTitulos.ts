import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloAReceber } from "@/types/pedido";

/**
 * Busca títulos a receber de um pedido, ordenados por número da parcela.
 * Usado na tab "Parcelas" do detalhe do pedido (F-2).
 */
export function usePedidoTitulos(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-titulos", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TituloAReceber[]> => {
      if (!pedidoId) return [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, conta_id, pedido_id, nf_id, analise_credito_id, " +
            "valor_bruto, valor_desconto, valor_juros, valor_multa, valor_correcao, valor_atual, " +
            "data_criacao, data_emissao_nf, data_vencimento_original, data_vencimento_atual, data_pagamento, " +
            "numero_parcela, total_parcelas, tipo_pagamento, eh_entrada, status, subestado_atraso, flag_bandeira_amarela, " +
            "link_pagamento"
        )
        .eq("pedido_id", pedidoId)
        .order("numero_parcela", { ascending: true });

      if (error) throw error;
      return (data || []) as TituloAReceber[];
    },
  });
}
