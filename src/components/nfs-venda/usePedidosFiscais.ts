import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { carregarPedidosFiscais, type PedidoFiscal } from "./pedidosFiscais";

export function usePedidosFiscais() {
  return useQuery({
    queryKey: ["pedidos-fiscais"],
    queryFn: () => carregarPedidosFiscais(async (de, ate) => {
      // The deployed view is ahead of the generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_pedidos_fiscais").select("*").order("data_pedido", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      return (data ?? []) as unknown as PedidoFiscal[];
    }),
  });
}