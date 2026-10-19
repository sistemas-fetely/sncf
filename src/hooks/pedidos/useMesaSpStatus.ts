import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Raiz da queryKey — ExpedirPorB2B também invalida essa chave na troca de CD. */
export const QUERY_KEY_MESA_SP_STATUS = "pedido-mesa-sp-status";

export interface MesaSpStatus {
  na_mesa_sp: boolean;
  etapa?: "fila" | "separacao" | "embalagem" | "aguardando_nf" | "aguardando_coleta" | "despachado";
  travado?: boolean;
  rotulo?: string;
  dica?: string | null;
}

/**
 * BANCADA-SP-TRAVA (19/10/2026): diz se o pedido B2B está na Mesa da Expedição SP,
 * em que etapa e se está travado. Fonte: RPC fn_pedido_mesa_sp_status.
 * FAIL-LOUD: erro do banco sobe sem catch silencioso — quem renderiza exibe.
 */
export function useMesaSpStatus(pedidoId: string | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY_MESA_SP_STATUS, pedidoId],
    enabled: !!pedidoId,
    staleTime: 10 * 1000,
    queryFn: async (): Promise<MesaSpStatus | null> => {
      if (!pedidoId) throw new Error("pedidoId obrigatório");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_pedido_mesa_sp_status", {
        p_pedido_id: pedidoId,
      });
      if (error) throw error;
      return (data ?? null) as MesaSpStatus | null;
    },
  });
}
