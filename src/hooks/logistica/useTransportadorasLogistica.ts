import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TransportadoraLogistica {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  cidade: string | null;
  uf: string | null;
}

export function useTransportadorasLogistica() {
  return useQuery({
    queryKey: ["logistica", "transportadoras"],
    queryFn: async (): Promise<TransportadoraLogistica[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("parceiros_comerciais")
        .select("id, razao_social, nome_fantasia, cnpj, cidade, uf")
        .contains("tipos", ["transportadora"])
        .eq("ativo", true)
        .order("razao_social");
      if (error) throw error;
      return (data ?? []) as TransportadoraLogistica[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
