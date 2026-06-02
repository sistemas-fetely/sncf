import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { NivelPrograma, CategoriaKa } from "@/types/credito";

interface Args {
  parceiro_id: string;
  nivel_programa?: NivelPrograma;
  categoria_ka?: CategoriaKa;
}

export function useAtualizarPrograma() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ parceiro_id, nivel_programa, categoria_ka }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const update: Record<string, any> = {};
      if (nivel_programa !== undefined) update.nivel_programa = nivel_programa;
      if (categoria_ka !== undefined) update.categoria_ka = categoria_ka;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("parceiros_comerciais")
        .update(update)
        .eq("id", parceiro_id);

      if (error) throw error;
      return { parceiro_id };
    },
    onSuccess: ({ parceiro_id }) => {
      qc.invalidateQueries({ queryKey: ["analise-detalhe"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhe", parceiro_id] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe"] });
      toast({ title: "Programa atualizado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" });
    },
  });
}
