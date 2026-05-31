import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RegraCadencia } from "@/types/credito";

interface Payload {
  id?: string;
  dados: Partial<Omit<RegraCadencia, "id" | "criado_em" | "criado_por">>;
}

export function useSalvarRegraCadencia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: Payload) => {
      const row = {
        nome: dados.nome,
        descricao: dados.descricao ?? null,
        ativa: dados.ativa ?? true,
        ordem: dados.ordem ?? 100,
        criterio: (dados.criterio ?? {}) as never,
        condicao_default: (dados.condicao_default ?? null) as never,
        parecer_template: dados.parecer_template ?? null,
      };
      if (id) {
        const { error } = await supabase
          .from("regras_cadencia_credito")
          .update(row)
          .eq("id", id);
        if (error) throw error;
      } else {
        if (!row.nome) throw new Error("Nome é obrigatório");
        const { error } = await supabase
          .from("regras_cadencia_credito")
          .insert(row as never);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      toast.success(vars.id ? "Regra atualizada" : "Regra criada");
      qc.invalidateQueries({ queryKey: ["regras-cadencia"] });
    },
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  });
}
