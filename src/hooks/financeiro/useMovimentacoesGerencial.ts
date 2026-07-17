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
 * Lê a view vw_movimentacoes_gerencial. Quando `competencia` é passada, filtra
 * por ela (compat com chamadas antigas). Quando null/undefined, retorna todo o
 * range gerencial (13 meses para trás até 1 à frente) para a visão de matriz.
 */
export function useMovimentacoesGerencial(
  competencia: string | null,
  tipo: "pagar" | "receber" = "pagar",
) {
  return useQuery({
    queryKey: ["movimentacoes-gerencial", competencia ?? "range", tipo],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("vw_movimentacoes_gerencial")
        .select("*")
        .eq("tipo", tipo);

      if (competencia) {
        q = q.eq("competencia", competencia);
      } else {
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 13, 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 1);
        const iso = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
        q = q.gte("competencia", iso(inicio)).lt("competencia", iso(fim));
      }

      const { data, error } = await q.order("competencia", { ascending: true });
      if (error) throw error;
      return (data || []) as MovimentacaoGerencial[];
    },
  });
}
