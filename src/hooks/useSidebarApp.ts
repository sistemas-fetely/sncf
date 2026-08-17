import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  usePermissoesDoUsuario,
  TELAS_PUBLICAS,
  temPermissaoTela,
} from "@/hooks/usePermissoesDoUsuario";


export interface LinhaSidebar {
  chave: string;
  nivel: string;
  pai_chave: string | null;
  label: string;
  icone: string | null;
  rota: string | null;
  ordem: number;
  tela_slug: string | null;
  status: string;
  apenas_super_admin: boolean;
}

export interface ItemSidebar extends LinhaSidebar {
  rota: string;
  exato: boolean;
}

/**
 * Bloco de sidebar. `label: null` = itens pendurados direto no app, sem grupo:
 * renderizam sem cabeçalho.
 */
export interface BlocoSidebar {
  chave: string;
  label: string | null;
  ordem: number;
  itens: ItemSidebar[];
}

/**
 * Estrutura da sidebar de um app, direto da sncf_navegacao (MENU-VIA-TABELA).
 * Mover, renomear ou reordenar item de menu é UPDATE no banco.
 * Visibilidade NÃO é decidida aqui — cada item pergunta ao useTelasVisiveis.
 */
export function useSidebarApp(app: string) {
  const query = useQuery({
    queryKey: ["sidebar-app", app],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LinhaSidebar[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("listar_sidebar_app", {
        p_app: app,
      });
      if (error) throw error;
      return (data ?? []) as LinhaSidebar[];
    },
  });

  const { roles } = useAuth();
  const isSuperAdmin = (roles ?? []).includes("super_admin");
  const { data: permitidas, isLoading: isLoadingPerms } = usePermissoesDoUsuario();

  const blocos = useMemo<BlocoSidebar[]>(() => {
    const linhas = query.data ?? [];
    const navegaveis = linhas.filter((l) => l.nivel !== "grupo" && l.rota);

    // Mesma precedência do RotaGate: super_admin vê tudo; em_construcao e
    // apenas_super_admin somem; slug passa por temPermissaoTela.
    const podeVer = (l: LinhaSidebar) => {
      if (isSuperAdmin) return true;
      if (l.status === "em_construcao") return false;
      if (l.apenas_super_admin) return false;
      if (!l.tela_slug) return true;
      if (TELAS_PUBLICAS.has(l.tela_slug)) return true;
      return temPermissaoTela(l.tela_slug, permitidas);
    };

    const itens = isSuperAdmin ? navegaveis : navegaveis.filter(podeVer);
    const rotas = itens.map((i) => i.rota as string);


    // `end` derivado da árvore: rota que é prefixo de outra rota do mesmo app
    // precisa de match exato, senão fica destacada junto com as filhas.
    const precisaExato = (rota: string) =>
      rotas.some((r) => r !== rota && r.startsWith(rota + "/"));

    const comoItem = (i: LinhaSidebar): ItemSidebar => ({
      ...i,
      rota: i.rota as string,
      exato: precisaExato(i.rota as string),
    });

    // Itens sem grupo: um bloco só, sem cabeçalho, posicionado pela menor ordem.
    // (Se itens soltos ficarem de ambos os lados de um grupo, todos vêm juntos
    // na posição do menor. Caso não existe hoje; se aparecer, cria-se um grupo.)
    const soltos = itens
      .filter((i) => i.pai_chave === app)
      .sort((a, b) => a.ordem - b.ordem)
      .map(comoItem);

    const blocoSoltos: BlocoSidebar[] = soltos.length
      ? [
          {
            chave: `${app}::soltos`,
            label: null,
            ordem: soltos[0].ordem,
            itens: soltos,
          },
        ]
      : [];

    const blocosGrupo: BlocoSidebar[] = linhas
      .filter((l) => l.nivel === "grupo")
      .map((g) => ({
        chave: g.chave,
        label: g.label,
        ordem: g.ordem,
        itens: itens
          .filter((i) => i.pai_chave === g.chave)
          .sort((a, b) => a.ordem - b.ordem)
          .map(comoItem),
      }));

    return [...blocoSoltos, ...blocosGrupo]
      // grupo sem item não vira cabeçalho órfão
      .filter((b) => b.itens.length > 0)
      .sort((a, b) => a.ordem - b.ordem);
  }, [query.data, app, isSuperAdmin, permitidas]);

  const isLoading = query.isLoading || (!isSuperAdmin && isLoadingPerms);

  return {
    blocos: isLoading ? [] : blocos,
    isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

