import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Deriva da ficha: `is_socio(_user_id)` no banco.
 * staleTime alto — vínculo de sócio não muda no meio da sessão.
 */
export function useIsSocio() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-socio", user?.id],
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_socio", { _user_id: user!.id });
      if (error) throw error;
      return data === true;
    },
  });
}
