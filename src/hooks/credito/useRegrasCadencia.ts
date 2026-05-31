import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { RegraCadencia, RegraCadenciaCriterio } from "@/types/credito";

export function useRegrasCadencia() {
  return useQuery({
    queryKey: ["regras-cadencia"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<RegraCadencia[]> => {
      const { data, error } = await supabase
        .from("regras_cadencia_credito")
        .select("*")
        .order("ordem", { ascending: true })
        .order("criado_em", { ascending: false });

      if (error) throw error;

      return (data || []).map((r) => ({
        id: r.id,
        nome: r.nome,
        descricao: r.descricao ?? undefined,
        ativa: r.ativa,
        ordem: r.ordem,
        criterio: (r.criterio as RegraCadenciaCriterio) ?? {},
        condicao_default: r.condicao_default,
        parecer_template: r.parecer_template ?? undefined,
        criado_em: r.criado_em,
        criado_por: r.criado_por ?? undefined,
      }));
    },
  });
}
