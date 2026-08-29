import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";


/**
 * Permissão nominal de AÇÃO (não de tela) via RPC `usuario_tem_acao`.
 * Sem bypass de super_admin — a RPC decide, de propósito.
 */
export function usePermissaoAcao(slug: string) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["permissao-acao", user?.id, slug],
    enabled: !!user?.id && !!slug,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("usuario_tem_acao", { p_slug: slug });
      if (error) throw error;
      return data === true;
    },
  });
  return { permitido: data === true, carregando: isLoading };
}
