import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useExcluirCompraRegistrada() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ compra_id, motivo }: { compra_id: string; motivo: string }) => {
      const { data, error } = await supabase.rpc("excluir_compra_registrada", {
        p_compra_id: compra_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "a-comprar"] });
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
      qc.invalidateQueries({ queryKey: ["compras", "registradas-do-pedido"] });
      toast.success("Compra excluída");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao excluir compra"),
  });
}
