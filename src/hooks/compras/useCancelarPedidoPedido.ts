import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCancelarPedidoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      pedido_id,
      motivo,
    }: {
      pedido_id: string;
      motivo: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cancelar_pedido_pedido", {
        p_pedido_id: pedido_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
      toast.success("Pedido cancelado");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar pedido"),
  });
}
