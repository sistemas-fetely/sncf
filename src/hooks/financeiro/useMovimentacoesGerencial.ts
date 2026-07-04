import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MovimentacaoGerencial = {
  id: string;
  tipo: string;
  competencia: string; // YYYY-MM-DD (primeiro dia do mês)
  descricao: string | null;
  fornecedor_cliente: string | null;
  parceiro_id: string | null;
  valor: number;
  status: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  plano_contas_id: string | null;
  plano_contas_nome: string | null;
  centro_custo_id: string | null;
  centro_custo_nome: string | null;
  nf_numero: string | null;
  categoria_confirmada: boolean | null;
  classificacao_completa: boolean;
};

/**
 * Lê a view vw_movimentacoes_gerencial filtrada por competência (primeiro dia do mês)
 * e tipo. Não está nos types gerados — usa cast padrão do projeto.
 */
export function useMovimentacoesGerencial(competencia: string, tipo: "pagar" | "receber" = "pagar") {
  return useQuery({
    queryKey: ["movimentacoes-gerencial", competencia, tipo],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_movimentacoes_gerencial")
        .select("*")
        .eq("competencia", competencia)
        .eq("tipo", tipo)
        .order("plano_contas_nome", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data || []) as MovimentacaoGerencial[];
    },
  });
}
