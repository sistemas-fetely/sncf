import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UnidadeMedida {
  id: string;
  sigla: string;
  nome: string;
  ordem: number;
}

export function useUnidadesMedida() {
  return useQuery({
    queryKey: ["compras", "unidades-medida"],
    staleTime: 1000 * 60 * 30,
    queryFn: async (): Promise<UnidadeMedida[]> => {
      const { data, error } = await supabase
        .from("unidades_medida")
        .select("id, sigla, nome, ordem")
        .eq("ativo", true)
        .order("ordem")
        .order("sigla");
      if (error) throw error;
      return (data || []) as UnidadeMedida[];
    },
  });
}
