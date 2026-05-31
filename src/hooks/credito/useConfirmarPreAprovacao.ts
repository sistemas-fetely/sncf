import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useConfirmarPreAprovacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (analiseId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_pre_aprovacao", {
        p_analise_id: analiseId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pré-aprovação confirmada — pedido avançou pra cobrança");
      qc.invalidateQueries({ queryKey: ["analises-fila"] });
      qc.invalidateQueries({ queryKey: ["analise-detalhe"] });
      qc.invalidateQueries({ queryKey: ["credito-stats"] });
    },
    onError: (e: Error) => toast.error(`Erro ao confirmar: ${e.message}`),
  });
}
