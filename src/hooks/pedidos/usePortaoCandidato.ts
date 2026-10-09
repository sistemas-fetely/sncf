import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { agruparCandidatos, type PortaoCandidato } from "@/lib/pedidos/portao-candidato";

export function usePortaoCandidato(pedidoIds: string[]) {
  const ids = [...new Set(pedidoIds)].sort();
  return useQuery({
    // Mesmo prefixo da grid: qualquer refetch/invalidação da fila inclui o sinal.
    queryKey: ["pedidos-fila", "portao-candidato", ids],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_portao_candidato")
        .select("pedido_id, meio, valor_origem, valor_esperado, origem_data, origem_descricao, origem_conta, dias_de_diferenca, identidade, situacao, motivo")
        .in("pedido_id", ids);
      if (error) throw error;
      return agruparCandidatos((data ?? []) as PortaoCandidato[]);
    },
  });
}