import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FilaInbox {
  chave: string;
  nome: string;
  rota: string;
  severidade: "critica" | "alta" | "normal";
  area_nome: string | null;
  total: number;
  erro: string | null;
}

const SEVERIDADE_PESO: Record<string, number> = {
  critica: 0,
  alta: 1,
  normal: 2,
};

export function useInboxFilas() {
  return useQuery({
    queryKey: ["tarefas", "inbox-filas"],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<FilaInbox[]> => {
      const { data, error } = await supabase.rpc("fn_inbox_filas");
      if (error) throw error;

      const filas = (data ?? []).map((f): FilaInbox => ({
        chave: f.chave,
        nome: f.nome,
        rota: f.rota,
        severidade: (f.severidade as FilaInbox["severidade"]) || "normal",
        area_nome: f.area_nome ?? null,
        total: Number(f.total),
        erro: f.erro ?? null,
      }));

      return filas.sort((a, b) => {
        const pa = SEVERIDADE_PESO[a.severidade] ?? 2;
        const pb = SEVERIDADE_PESO[b.severidade] ?? 2;
        if (pa !== pb) return pa - pb;
        return b.total - a.total;
      });
    },
  });
}
