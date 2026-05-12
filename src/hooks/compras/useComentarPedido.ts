import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useComentarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedido_id, conteudo }: { pedido_id: string; conteudo: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("comentar_pedido", {
        p_pedido_id: pedido_id,
        p_conteudo: conteudo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["compras", "timeline-pedido", variables.pedido_id] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao comentar"),
  });
}
