import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StatusRota } from "@/config/rotasRegistry";

export interface RegraNavegacao {
  rota: string;
  status: StatusRota;
  tela_slug: string | null;
  apenas_super_admin: boolean;
}

/**
 * Fonte do portão E do menu — doutrina MENU-VIA-TABELA.
 * Lê sncf_navegacao via RPC listar_navegacao_portao().
 * Substitui useRotasConfig (sncf_rotas_config), que segue de pé como rollback
 * até o passo 6 da ordem de desmonte do Mapa de Navegação.
 */
export function useNavegacaoPortao() {
  return useQuery({
    queryKey: ["navegacao-portao"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<RegraNavegacao[]> => {
      const { data, error } = await (supabase as any).rpc("listar_navegacao_portao");
      if (error) throw error;
      return (data ?? []) as RegraNavegacao[];
    },
  });
}

/**
 * Resolve a regra por match de prefixo mais longo.
 * Retorna null se nada casar — aí quem chama cai no rotasRegistry.ts.
 */
export function resolverRegraNavegacao(
  pathname: string,
  rotas: RegraNavegacao[] | undefined
): RegraNavegacao | null {
  if (!rotas || rotas.length === 0) return null;
  let melhor: RegraNavegacao | null = null;
  for (const r of rotas) {
    const casa = pathname === r.rota || pathname.startsWith(r.rota + "/");
    if (casa && (!melhor || r.rota.length > melhor.rota.length)) {
      melhor = r;
    }
  }
  return melhor;
}
