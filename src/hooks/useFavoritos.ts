import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNavegacaoMenu } from "@/hooks/useMenuApp";
import { toast } from "sonner";

/**
 * Favoritos do usuário — MENU-VIA-TABELA (22/08/2026).
 *
 * A linha guarda só `rota` (+ snapshot de titulo/icone como fallback). O
 * rótulo, o ícone e o app que aparecem na tela são RESOLVIDOS ao ler, contra
 * a sncf_navegacao — assim renomear uma tela na tabela renomeia o favorito de
 * todo mundo, sem migração.
 *
 * `pilar` guarda o app_chave e tem FK pra sncf_navegacao. Antes tinha um CHECK
 * travado em ('sncf','people','ti','admin') — vocabulário morto de 4 pilares
 * que fazia favoritar tela de SOPs/Finanças/Crédito falhar por violação de
 * constraint. Derrubado em 22/08 (DIMENSÃO-VIA-TABELA).
 */

export interface PaginaFavorita {
  id: string;
  rota: string;
  /** Rótulo resolvido da sncf_navegacao; cai no snapshot se a rota saiu da tabela. */
  titulo: string;
  /** app_chave da sncf_navegacao (ex: 'sops', 'financas'). */
  pilar: string | null;
  /** Rótulo do app, pro badge (ex: 'SOPs'). Resolvido, nunca hardcoded. */
  appLabel: string | null;
  icone: string | null;
  ordem: number;
  criado_em: string;
}

interface LinhaFavorita {
  id: string;
  rota: string;
  titulo: string;
  pilar: string | null;
  icone: string | null;
  ordem: number;
  criado_em: string;
}

export function useFavoritos() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: nav } = useNavegacaoMenu();

  const { data: linhas = [], isLoading } = useQuery({
    queryKey: ["favoritos", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<LinhaFavorita[]> => {
      const { data, error } = await supabase
        .from("usuario_paginas_favoritas")
        .select("id, rota, titulo, pilar, icone, ordem, criado_em")
        .eq("user_id", user!.id)
        .order("ordem")
        .order("criado_em");
      if (error) throw error;
      return (data ?? []) as LinhaFavorita[];
    },
  });

  // Índice rota -> linha da navegação, pra resolver rótulo/ícone/app.
  const porRota = useMemo(() => {
    const m = new Map<string, { label: string; icone: string | null; app: string }>();
    for (const l of nav ?? []) {
      if (l.rota) m.set(l.rota, { label: l.label, icone: l.icone, app: l.app_chave });
    }
    return m;
  }, [nav]);

  const rotuloApp = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of nav ?? []) {
      if (l.nivel === "app") m.set(l.chave, l.label);
    }
    return m;
  }, [nav]);

  const favoritos: PaginaFavorita[] = useMemo(
    () =>
      linhas.map((f) => {
        const daTabela = porRota.get(f.rota);
        const app = daTabela?.app ?? f.pilar;
        return {
          id: f.id,
          rota: f.rota,
          titulo: daTabela?.label ?? f.titulo,
          pilar: app,
          appLabel: app ? rotuloApp.get(app) ?? null : null,
          icone: daTabela?.icone ?? f.icone,
          ordem: f.ordem,
          criado_em: f.criado_em,
        };
      }),
    [linhas, porRota, rotuloApp]
  );

  const isFavorito = useCallback(
    (rota: string) => linhas.some((f) => f.rota === rota),
    [linhas]
  );

  const toggle = useMutation({
    mutationFn: async (rota: string) => {
      if (!user?.id) throw new Error("Sem usuário logado.");
      const existente = linhas.find((f) => f.rota === rota);

      if (existente) {
        const { error } = await supabase
          .from("usuario_paginas_favoritas")
          .delete()
          .eq("id", existente.id);
        if (error) throw error;
        return { acao: "removido" as const };
      }

      const daTabela = porRota.get(rota);
      const { error } = await supabase.from("usuario_paginas_favoritas").insert({
        user_id: user.id,
        rota,
        titulo: daTabela?.label ?? rota,
        pilar: daTabela?.app ?? null,
        icone: daTabela?.icone ?? null,
        ordem: linhas.length,
      });
      if (error) throw error;
      return { acao: "adicionado" as const };
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["favoritos", user?.id] });
      toast.success(r.acao === "adicionado" ? "Adicionado aos favoritos" : "Removido dos favoritos");
    },
    onError: (e: Error) => toast.error(`Não foi possível salvar o favorito: ${e.message}`),
  });

  /** Recebe os ids já na ordem desejada e persiste `ordem` = índice. */
  const reordenar = useMutation({
    mutationFn: async (idsNaOrdem: string[]) => {
      if (!user?.id) throw new Error("Sem usuário logado.");
      // FAIL-LOUD: um update por linha, todos aguardados; erro aborta e avisa.
      for (let i = 0; i < idsNaOrdem.length; i++) {
        const { error } = await supabase
          .from("usuario_paginas_favoritas")
          .update({ ordem: i })
          .eq("id", idsNaOrdem[i])
          .eq("user_id", user.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["favoritos", user?.id] });
    },
    onError: (e: Error) => toast.error(`Não foi possível reordenar: ${e.message}`),
  });

  return {
    favoritos,
    isLoading,
    isFavorito,
    toggleFavorito: (rota: string) => toggle.mutate(rota),
    reordenar: (ids: string[]) => reordenar.mutate(ids),
    salvando: toggle.isPending || reordenar.isPending,
  };
}

/**
 * Resolve a rota atual contra a sncf_navegacao: casa exata primeiro, depois o
 * prefixo mais longo (ex: /pedidos/123 -> /pedidos). Devolve null se a rota
 * não está declarada — favoritar tela não declarada não deve existir.
 */
export function useRotaNavegavel(pathname: string) {
  const { data: nav } = useNavegacaoMenu();

  return useMemo(() => {
    const comRota = (nav ?? []).filter((l) => !!l.rota);
    const exata = comRota.find((l) => l.rota === pathname);
    if (exata) return { rota: exata.rota as string, label: exata.label };

    let melhor: { rota: string; label: string } | null = null;
    for (const l of comRota) {
      const r = l.rota as string;
      if (r !== "/" && pathname.startsWith(r + "/")) {
        if (!melhor || r.length > melhor.rota.length) melhor = { rota: r, label: l.label };
      }
    }
    return melhor;
  }, [nav, pathname]);
}
