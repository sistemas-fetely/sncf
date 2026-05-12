import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useEnviarPedidoCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pedido_id: string) => {
      const { data, error } = await supabase.rpc("enviar_pedido_compra", {
        p_pedido_id: pedido_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
      toast.success("Pedido enviado");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao enviar pedido"),
  });
}
