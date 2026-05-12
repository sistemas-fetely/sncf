import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useCancelarItemPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ item_id, motivo }: { item_id: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("cancelar_item_pedido", {
        p_item_id: item_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "a-comprar"] });
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
      toast.success("Item cancelado");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao cancelar item"),
  });
}
