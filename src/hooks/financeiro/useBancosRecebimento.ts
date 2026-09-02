import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Contas onde o dinheiro do cliente entra (`banco_recebimento`).
 * Dimensão do banco — a tela não mantém lista própria.
 */
export interface BancoRecebimento {
  id: string;
  nome: string;
}

export function useBancosRecebimento(habilitado = true) {
  return useQuery({
    queryKey: ["bancos-recebimento-ativos"],
    enabled: habilitado,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<BancoRecebimento[]> => {
      const { data, error } = await supabase
        .from("banco_recebimento")
        .select("id, nome")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((b) => ({ id: b.id as string, nome: (b.nome as string) ?? "" }));
    },
  });
}
