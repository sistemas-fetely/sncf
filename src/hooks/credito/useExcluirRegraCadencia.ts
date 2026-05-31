import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useExcluirRegraCadencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("regras_cadencia_credito")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Regra excluída");
      qc.invalidateQueries({ queryKey: ["regras-cadencia"] });
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });
}

export function useContarAnalisesPorRegra() {
  // helper opcional usado pelo confirm dialog
  return useMutation({
    mutationFn: async (regraId: string): Promise<number> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any)
        .from("analises_credito")
        .select("id", { count: "exact", head: true })
        .eq("pre_aprovado_regra_id", regraId);
      if (error) throw error;
      return count ?? 0;
    },
  });
}
