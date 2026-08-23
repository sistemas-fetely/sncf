import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nível do usuário na escala cumulativa (1..6).
 * Substitui hasAnyRole([...]) com papéis nominais — os papéis legados
 * (financeiro, coordenacao_op_fin, gestor_rh, admin_rh) foram extintos em 23/08/2026.
 */
export function useNivel() {
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["nivel-do-usuario", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("nivel_do_usuario", { _user_id: user!.id });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });
  const nivel = q.data ?? 0;
  return {
    nivel,
    carregando: q.isLoading,
    // fail-closed: enquanto carrega, temNivel devolve false
    temNivel: (n: number) => !q.isLoading && nivel >= n,
  };
}
