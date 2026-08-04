import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RecebivelFamilia {
  recebivel_na_familia: boolean | null;
  familia_mae_externo: string | null;
}

/**
 * Lê apenas a cobertura de recebível da família (split) para um pedido.
 * Usado no estado vazio da aba "Parcelas": pedido filho pode estar coberto
 * pelos títulos da mãe, sem título próprio.
 */
export function useRecebivelFamilia(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["recebivel-familia", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<RecebivelFamilia | null> => {
      if (!pedidoId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_situacao_financeira")
        .select("recebivel_na_familia, familia_mae_externo")
        .eq("pedido_id", pedidoId)
        .maybeSingle();

      if (error) throw error;
      return (data as RecebivelFamilia) ?? null;
    },
  });
}
