import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useExcluirComentario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      comentario_id,
    }: {
      comentario_id: string;
      pedido_id: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("excluir_comentario_pedido", {
        p_comentario_id: comentario_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["compras", "timeline-pedido", variables.pedido_id] });
      toast.success("Comentário excluído");
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao excluir"),
  });
}
