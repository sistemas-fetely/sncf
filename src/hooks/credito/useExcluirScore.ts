import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  scoreId: string;
  storagePath: string | null;
  analiseId: string;
}

export function useExcluirScore() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ scoreId, storagePath }: Args) => {
      if (storagePath) {
        await supabase.storage.from("ged").remove([storagePath]).catch(() => {});
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("analise_credito_scores")
        .delete()
        .eq("id", scoreId);
      if (error) throw error;
      return { ok: true };
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["analise-detalhe", vars.analiseId] });
      toast({ title: "Bureau removido" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao remover bureau", description: e.message, variant: "destructive" });
    },
  });
}
