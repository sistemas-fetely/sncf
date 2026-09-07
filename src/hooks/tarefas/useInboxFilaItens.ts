import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useInboxFilaItens(chave: string | null, limite = 25) {
  return useQuery({
    queryKey: ["tarefas", "inbox-fila-itens", chave, limite],
    enabled: !!chave,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Record<string, unknown>[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_inbox_fila_itens", {
        p_chave: chave,
        p_limite: limite,
      });
      if (error) throw error;
      if (data && !Array.isArray(data) && typeof data === "object" && "erro" in data) {
        throw new Error(String((data as { erro: unknown }).erro));
      }
      if (!Array.isArray(data)) return [];
      return data as Record<string, unknown>[];
    },
  });
}
