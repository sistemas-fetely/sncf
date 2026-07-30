import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EstoqueCondicao {
  codigo: string;
  rotulo: string;
}

export function useEstoqueCondicoes() {
  return useQuery({
    queryKey: ["estoque-condicoes"],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<EstoqueCondicao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("estoque_condicao")
        .select("codigo,rotulo")
        .eq("ativo", true)
        .order("rotulo");
      if (error) throw error;
      return (data ?? []) as EstoqueCondicao[];
    },
  });
}
