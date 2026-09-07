// Abrangência do processo: até onde ele vale. Dimensão no banco, nunca lista fixa no front.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AbrangenciaDim {
  codigo: string;
  nome: string;
  descricao: string | null;
  exige_alvo: boolean;
  ordem: number | null;
}

export function useAbrangenciaDim() {
  return useQuery({
    queryKey: ["processo-abrangencia-dim"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<AbrangenciaDim[]> => {
      const { data, error } = await (supabase as any)
        .from("processo_abrangencia_dim")
        .select("codigo,nome,descricao,exige_alvo,ordem")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AbrangenciaDim[];
    },
  });
}
