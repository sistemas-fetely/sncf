import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Adquirentes de cartão (`adquirente`). No dia da captura o dinheiro está com
 * a adquirente — cai na conta dias depois, via repasse.
 */
export interface Adquirente {
  id: string;
  nome: string;
}

export function useAdquirentes(habilitado = true) {
  return useQuery({
    queryKey: ["adquirentes-ativos"],
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Adquirente[]> => {
      const { data, error } = await supabase
        .from("adquirente")
        .select("id, nome, ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []).map((a) => ({ id: a.id as string, nome: (a.nome as string) ?? "" }));
    },
  });
}
