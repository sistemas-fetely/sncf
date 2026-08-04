import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTelasVisiveis } from "@/hooks/useTelasVisiveis";

export interface LinhaMenu {
  chave: string;
  pai_chave: string | null;
  nivel: string;
  label: string;
  icone: string | null;
  rota: string | null;
  ordem: number;
  status: string;
  tela_slug: string | null;
  apenas_super_admin: boolean;
  superficies: string[] | null;
  badge_fonte: string | null;
  dominio: string | null;
  app_chave: string;
}

export interface ItemMenu {
  chave: string;
  label: string;
  icone: string | null;
  rota: string;
  badge_fonte: string | null;
}

export interface GrupoMenu {
  chave: string;
  label: string;
  itens: ItemMenu[];
}

/**
 * Estrutura do menu vinda da tabela — doutrina MENU-VIA-TABELA.
 * Uma unica consulta serve todas as sidebars (161 linhas, cache de 5min).
 */
export function useNavegacaoMenu() {
  return useQuery({
    queryKey: ["navegacao-menu"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LinhaMenu[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("listar_navegacao_menu");
      if (error) throw error;
      return (data ?? []) as LinhaMenu[];
    },
  });
}

/**
 * Monta a arvore de um app para a sidebar.
 *
 * A visibilidade NAO e decidida aqui: e delegada a useTelasVisiveis, a mesma
 * funcao que o RotaGate usa. Menu e portao leem a mesma linha e aplicam a
 * mesma precedencia — nunca duas implementacoes de autorizacao.
 */
export function useMenuApp(appChave: string) {
  const { data: linhas, isLoading } = useNavegacaoMenu();

  const doApp = useMemo(
    () => (linhas ?? []).filter((l) => l.app_chave === appChave),
    [linhas, appChave]
  );

  const rotas = useMemo(
    () =>
      doApp
        .filter((l) => l.rota && (l.superficies ?? []).includes("sidebar"))
        .map((l) => l.rota as string),
    [doApp]
  );

  const visiveis = useTelasVisiveis(rotas);

  return useMemo(() => {
    const itensVisiveis = doApp.filter(
      (l) =>
        l.rota &&
        (l.superficies ?? []).includes("sidebar") &&
        visiveis.has(l.rota)
    );

    const grupos: GrupoMenu[] = doApp
      .filter((l) => l.nivel === "grupo")
      .sort((a, b) => a.ordem - b.ordem)
      .map((g) => ({
        chave: g.chave,
        label: g.label,
        itens: itensVisiveis
          .filter((i) => i.pai_chave === g.chave)
          .sort((a, b) => a.ordem - b.ordem)
          .map((i) => ({
            chave: i.chave,
            label: i.label,
            icone: i.icone,
            rota: i.rota as string,
            badge_fonte: i.badge_fonte,
          })),
      }))
      .filter((g) => g.itens.length > 0);

    const chavesDeGrupo = new Set(doApp.filter((l) => l.nivel === "grupo").map((g) => g.chave));

    const soltos: ItemMenu[] = itensVisiveis
      .filter((i) => !i.pai_chave || !chavesDeGrupo.has(i.pai_chave))
      .sort((a, b) => a.ordem - b.ordem)
      .map((i) => ({
        chave: i.chave,
        label: i.label,
        icone: i.icone,
        rota: i.rota as string,
        badge_fonte: i.badge_fonte,
      }));

    return { grupos, soltos, isLoading };
  }, [doApp, visiveis, isLoading]);
}
