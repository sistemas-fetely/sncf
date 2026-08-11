import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SituacaoFinanceiraPedido {
  situacao_financeira: string | null;
  situacao_rotulo: string | null;
  lastro_fonte: string | null;
  valor_liquido: number | null;
  valor_aberto: number | null;
  valor_pago: number | null;
  haver_aplicado: number | null;
}

/**
 * Situação financeira real do pedido (vw_pedido_situacao_financeira).
 * Usado na aba Parcelas quando não há título: pedido pago com haver/adiantamento
 * não gera título antes da NF, e "nenhum título" não significa "não pago".
 */
export function useSituacaoFinanceiraPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["situacao-financeira-pedido", pedidoId],
    enabled: !!pedidoId,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SituacaoFinanceiraPedido | null> => {
      if (!pedidoId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_situacao_financeira")
        .select(
          "situacao_financeira, situacao_rotulo, lastro_fonte, valor_liquido, valor_aberto, valor_pago, haver_aplicado",
        )
        .eq("pedido_id", pedidoId)
        .maybeSingle();

      if (error) throw error;
      return (data as SituacaoFinanceiraPedido) ?? null;
    },
  });
}
