import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useToggleRegraCadencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      const { error } = await supabase
        .from("regras_cadencia_credito")
        .update({ ativa })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(vars.ativa ? "Regra ativada" : "Regra desativada");
      qc.invalidateQueries({ queryKey: ["regras-cadencia"] });
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}
