import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Telas acessíveis a qualquer usuário aprovado, independente de grupo.
export const TELAS_PUBLICAS = new Set(["tela.home", "tela.self"]);

// Permissao de tela e SEMPRE nominal: o slug tem que estar no grupo do usuario.
// Nao existe guarda-chuva nem heranca por prefixo — politica mora em tabela
// (doutrina DIMENSAO-VIA-TABELA), nunca em codigo. Se um grupo precisa ver uma
// tela de Financas, o slug dela entra em grupo_acesso_permissoes.
// Historico: ate 13/08/2026 quem tinha "tela.financeiro" passava em todo
// "tela.fin_*" por uma regra escrita aqui. Removida — era escalada silenciosa.
export function temPermissaoTela(
  slug: string | null | undefined,
  permitidas: Set<string> | undefined,
): boolean {
  if (!slug) return false;
  if (permitidas?.has(slug)) return true;
  return false;
}

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
