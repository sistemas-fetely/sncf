import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useTransportadoras() {
  return useQuery({
    queryKey: ["transportadoras"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, bling_id")
        .contains("tipos", ["transportadora"])
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; razao_social: string; nome_fantasia: string | null; cnpj: string | null; bling_id: string | null }>;
    },
    staleTime: 5 * 60 * 1000,
  });
}
