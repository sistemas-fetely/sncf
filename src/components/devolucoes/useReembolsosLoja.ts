import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { carregarReembolsosLoja, type ReembolsoLoja } from "./reembolsosLoja";

export function useReembolsosLoja() {
  return useQuery({
    queryKey: ["reembolsos-loja"],
    queryFn: () => carregarReembolsosLoja(async (de, ate) => {
      // The deployed view is ahead of the generated client types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("vw_reembolso_loja").select("*").order("data_reembolso", { ascending: false }).order("id").range(de, ate);
      if (error) throw error;
      return (data ?? []) as unknown as ReembolsoLoja[];
    }),
  });
}