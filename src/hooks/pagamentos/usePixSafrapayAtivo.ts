import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** safrapay_config.pix_ativo — false = PIX local (QR na chave da Fetely) é o oficial. */
export function usePixSafrapayAtivo() {
  return useQuery({
    queryKey: ["safrapay-config-pix-ativo"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("safrapay_config" as never).select("pix_ativo").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as unknown as { pix_ativo: boolean | null } | null)?.pix_ativo === true;
    },
  });
}
