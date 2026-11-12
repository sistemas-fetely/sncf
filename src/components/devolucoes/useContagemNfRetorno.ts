import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useContagemNfRetorno(enabled: boolean) {
  return useQuery({
    queryKey: ["devolucao-vinculo-mesa", "contagem-sugeridos"],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase.from("vw_devolucao_vinculo_mesa")
        .select("id", { count: "exact", head: true }).eq("status", "sugerido");
      if (error) throw error;
      return count ?? 0;
    },
  });
}
