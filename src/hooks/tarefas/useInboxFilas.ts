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

// Chave fora do prefixo "tarefas": invalidações de tarefa não releem as filas.
export const KEY_INBOX_FILAS = ["inbox-filas"] as const;

export function useInboxFilas() {
  return useQuery({
    queryKey: KEY_INBOX_FILAS,
    // fora da rede de segurança: contagem vem de cache do banco (2 min)
    meta: { pesada: true },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 120_000,
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
