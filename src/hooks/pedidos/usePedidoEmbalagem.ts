import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoEmbalagem {
  caixas_estimadas: number | null;
  caixas_min: number | null;
  caixas_max: number | null;
  caixas_fonte: string | null;
  caixas_modelo: number | null;
  caixas_piso_fisico: number | null;
  pacotes_v: number | null;
  pacotes_g: number | null;
  pacotes_p: number | null;
  pacotes_total: number | null;
  litros_solidos: number | null;
  fator_embalagem: number | null;
  cubagem_expedicao_m3: number | null;
  peso_expedido_kg: number | null;
  peso_taxado_previsto: number | null;
  skus_sem_dimensao: number | null;
}

/**
 * Leitura pura da view `vw_pedido_embalagem`. O front só formata — nenhum
 * cálculo de embalagem/cubagem é refeito aqui.
 */
export function usePedidoEmbalagem(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["pedido-embalagem", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<PedidoEmbalagem | null> => {
      const { data, error } = await supabase
        .from("vw_pedido_embalagem")
        .select(
          "caixas_estimadas, caixas_fonte, caixas_modelo, caixas_piso_fisico, pacotes_v, pacotes_g, pacotes_p, pacotes_total, litros_solidos, fator_embalagem, cubagem_expedicao_m3, peso_expedido_kg, peso_taxado_previsto, skus_sem_dimensao",
        )
        .eq("pedido_id", pedidoId!)
        .maybeSingle();
      if (error) throw error;
      return (data as PedidoEmbalagem | null) ?? null;
    },
  });
}
