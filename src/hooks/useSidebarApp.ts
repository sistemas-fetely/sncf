import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export interface GrupoSidebar {
  chave: string;
  label: string;
  ordem: number;
  itens: ItemSidebar[];
}

/**
 * Estrutura da sidebar de um app, direto da sncf_navegacao (MENU-VIA-TABELA).
 * Mover, renomear ou reordenar item de menu passa a ser UPDATE no banco.
 * Visibilidade NÃO é decidida aqui — cada FinancasSidebarItem pergunta ao
 * useTelasVisiveis, como já fazia.
 */
export function useSidebarApp(app: string) {
  const query = useQuery({
    queryKey: ["sidebar-app", app],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LinhaSidebar[]> => {
      const { data, error } = await (supabase as any).rpc("listar_sidebar_app", {
        p_app: app,
      });
      if (error) throw error;
      return (data ?? []) as LinhaSidebar[];
    },
  });

  const grupos = useMemo<GrupoSidebar[]>(() => {
    const linhas = query.data ?? [];
    const itens = linhas.filter((l) => l.nivel !== "grupo" && l.rota);
    const rotas = itens.map((i) => i.rota as string);

    // `end` derivado da árvore: rota que é prefixo de outra rota do mesmo app
    // precisa de match exato, senão fica destacada junto com as filhas.
    // Assim item novo não depende de alguém lembrar de marcar.
    const precisaExato = (rota: string) =>
      rotas.some((r) => r !== rota && r.startsWith(rota + "/"));

    return linhas
      .filter((l) => l.nivel === "grupo")
      .sort((a, b) => a.ordem - b.ordem)
      .map((g) => ({
        chave: g.chave,
        label: g.label,
        ordem: g.ordem,
        itens: itens
          .filter((i) => i.pai_chave === g.chave)
          .sort((a, b) => a.ordem - b.ordem)
          .map((i) => ({
            ...i,
            rota: i.rota as string,
            exato: precisaExato(i.rota as string),
          })),
      }))
      // grupo sem item não vira cabeçalho órfão
      .filter((g) => g.itens.length > 0);
  }, [query.data]);

  return {
    grupos,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
