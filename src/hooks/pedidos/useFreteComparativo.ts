import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FreteComparativoOpcao {
  transportadora_id: string | null;
  transportadora_nome: string;
  cnpj: string | null;
  erro: string | null;
  valor_estimado: number | null;
  prazo_dias: number | null;
  zona: string | null;
  uf_destino: string | null;
  pct_sobre_pedido: number | null;
  breakdown: Record<string, number> | null;
  valor_sem_icms?: number | null;
  icms_aliquota?: number | null;
}

export interface FreteComparativoResult {
  ok?: boolean;
  erro?: string;
  cep_destino?: string;
  peso_usado?: number;
  peso_fonte?: "bruto" | "cubado" | "informado";
  peso_bruto?: number;
  peso_cubado?: number;
  peso_expedido?: number | null;
  caixas_estimadas?: number | null;
  cubagem_expedicao_m3?: number | null;
  cubagem_solida_m3?: number | null;
  fator_cubagem?: number | null;
  valor_referencia?: number;
  opcoes?: FreteComparativoOpcao[];
}


export function useFreteComparativo(pedidoId: string | undefined) {
  return useQuery<FreteComparativoResult>({
    queryKey: ["frete-comparativo", pedidoId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("fn_frete_comparativo", {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      return (data ?? {}) as FreteComparativoResult;
    },
    enabled: false,
    staleTime: 60_000,
  });
}
