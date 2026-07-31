import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BadgeNavegacao {
  total: number;
  severidade: string;
}

/**
 * Consome fn_badges() e devolve um Map de `fonte` -> { total, severidade }.
 * `fonte` casa com sncf_navegacao.badge_fonte (ex: 'inbox_tarefas', 'fila:<chave>').
 * Chave ausente = nenhum badge (de propósito).
 */
export function useBadgesNavegacao() {
  return useQuery({
    queryKey: ["badges-navegacao"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Map<string, BadgeNavegacao>> => {
      const { data, error } = await (supabase as any).rpc("fn_badges");
      if (error) throw error;
      const mapa = new Map<string, BadgeNavegacao>();
      for (const row of (data ?? []) as any[]) {
        if (!row?.fonte) continue;
        mapa.set(String(row.fonte), {
          total: Number(row.total ?? 0),
          severidade: String(row.severidade ?? "normal"),
        });
      }
      return mapa;
    },
  });
}
