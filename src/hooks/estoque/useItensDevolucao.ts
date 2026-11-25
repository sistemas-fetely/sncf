import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { mapearItensDevolucao, type ItemGavetaDevolucao } from "@/lib/devolucao/gavetaDevolucao";

// GAVETA-ITENS-COMPLETOS (25/11/2026): a tabela de Itens da gaveta lê
// vw_devolucao_itens, que traz TODOS os itens da devolução (inclusive os
// totalmente retornados e os de devoluções já recebidas/conferidas).
// vw_devolucao_retorno_pendente só tem pendência > 0 de devoluções abertas,
// então uma devolução concluída aparecia vazia. Os demais usos de pendMap
// (botão Conferir, cards, contagens da lista) continuam na view de pendência.
export function useItensDevolucao(devolucaoId: string | null) {
  return useQuery({
    queryKey: ["devolucao-itens", devolucaoId],
    enabled: !!devolucaoId,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<ItemGavetaDevolucao[]> => {
      const { data, error } = await supabase
        .from("vw_devolucao_itens")
        .select("sku,nome_comercial,qtd_saiu,qtd_ja_retornada,qtd_pendente")
        .eq("devolucao_id", devolucaoId!);
      if (error) throw error;
      return mapearItensDevolucao(data ?? []);
    },
  });
}
