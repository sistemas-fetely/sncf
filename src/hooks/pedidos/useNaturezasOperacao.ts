import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NaturezaOperacaoOpcao {
  codigo: string;
  nome: string;
  gera_titulo_receber: boolean;
  entra_receita: boolean;
  precificacao: string | null;
}

/** Naturezas de operação ativas, na ordem definida pelo cadastro. */
export function useNaturezasOperacao() {
  return useQuery({
    queryKey: ["naturezas-operacao-ativas"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<NaturezaOperacaoOpcao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data, error } = await sb
        .from("naturezas_operacao")
        .select("codigo, nome, gera_titulo_receber, entra_receita, precificacao")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((n: any) => ({
        codigo: n.codigo,
        nome: n.nome,
        gera_titulo_receber: !!n.gera_titulo_receber,
        entra_receita: !!n.entra_receita,
        precificacao: n.precificacao ?? null,
      }));
    },
  });
}
