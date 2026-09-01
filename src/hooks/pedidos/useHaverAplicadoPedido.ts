import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * HAVER-É-PAGAMENTO: soma o crédito do cliente já aplicado neste pedido
 * (haver_aplicacao.valor_aplicado). Retorna 0 quando não há aplicação.
 * Esse valor cobre parte do pedido e NÃO entra no plano de parcelas.
 */
export function useHaverAplicadoPedido(pedidoId?: string | null) {
  return useQuery({
    queryKey: ["haver-aplicado-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("haver_aplicacao")
        .select("valor_aplicado")
        .eq("pedido_id", pedidoId);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).reduce((a: number, r: any) => a + Number(r.valor_aplicado ?? 0), 0);
    },
  });
}
