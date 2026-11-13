import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** safrapay_config.pix_no_link — true = PIX por link Safrapay liberado (o QR local continua existindo). */
export function usePixNoLink() {
  return useQuery({
    queryKey: ["safrapay-config-pix-no-link"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("safrapay_config" as never).select("pix_no_link").eq("id", 1).maybeSingle();
      if (error) throw error;
      return (data as unknown as { pix_no_link: boolean | null } | null)?.pix_no_link === true;
    },
  });
}
