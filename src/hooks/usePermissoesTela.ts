import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TELAS_PUBLICAS } from "@/hooks/usePermissoesDoUsuario";

// VERBO-VEM-DO-BANCO: grupo_acesso_permissoes separa ver/criar/editar/apagar.
// usuario_permissoes_telas agrega por bool_or entre grupos (o mais permissivo
// vence). O front nao infere verbo: le o que o banco devolve.
// Falha para o lado restritivo — enquanto carrega, escrita fica desligada.

export interface VerbosTela {
  podeVer: boolean;
  podeCriar: boolean;
  podeEditar: boolean;
  podeApagar: boolean;
  /** true enquanto carrega — a tela deve tratar como somente leitura */
  carregando: boolean;
}

interface LinhaVerbos {
  slug: string;
  pode_ver: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_apagar: boolean;
}

const NEGADO: VerbosTela = {
  podeVer: false,
  podeCriar: false,
  podeEditar: false,
  podeApagar: false,
  carregando: false,
};

export function usePermissoesTela(slug: string): VerbosTela {
  const { user, roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const ehPublica = TELAS_PUBLICAS.has(slug);

  const query = useQuery({
    queryKey: ["permissoes-verbos-telas", user?.id],
    enabled: !!user?.id && !isSuperAdmin,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, LinhaVerbos>> => {
      const { data, error } = await supabase.rpc("usuario_permissoes_telas", {
        p_user_id: user!.id,
      });
      if (error) throw error;
      const mapa: Record<string, LinhaVerbos> = {};
      for (const r of (data ?? []) as LinhaVerbos[]) mapa[r.slug] = r;
      return mapa;
    },
  });

  if (isSuperAdmin) {
    return {
      podeVer: true,
      podeCriar: true,
      podeEditar: true,
      podeApagar: true,
      carregando: false,
    };
  }

  // Tela publica da direito de ver, nunca de escrever.
  if (ehPublica) {
    return { ...NEGADO, podeVer: true };
  }

  if (!user?.id) return NEGADO;
  if (query.isLoading || query.isPending) return { ...NEGADO, carregando: true };

  const linha = query.data?.[slug];
  if (!linha) return NEGADO;

  return {
    podeVer: !!linha.pode_ver,
    podeCriar: !!linha.pode_criar,
    podeEditar: !!linha.pode_editar,
    podeApagar: !!linha.pode_apagar,
    carregando: false,
  };
}
