import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Deriva da ficha: `is_diretoria(_user_id)` no banco.
 * staleTime alto — vínculo de diretoria não muda no meio da sessão.
 */
export function useIsDiretoria() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is-diretoria", user?.id],
    enabled: !!user?.id,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_diretoria", { _user_id: user!.id });
      if (error) throw error;
      return data === true;
    },
  });
}
