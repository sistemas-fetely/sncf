import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Telas acessíveis a qualquer usuário aprovado, independente de grupo.
export const TELAS_PUBLICAS = new Set(["tela.home", "tela.self"]);

export function usePermissoesDoUsuario() {
  const { user, roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");

  return useQuery({
    queryKey: ["permissoes-telas", user?.id],
    enabled: !!user?.id && !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.rpc("usuario_telas_permitidas", {
        p_user_id: user!.id,
      });
      if (error) throw error;
      return new Set<string>((data ?? []).map((r: { slug: string }) => r.slug));
    },
  });
}
