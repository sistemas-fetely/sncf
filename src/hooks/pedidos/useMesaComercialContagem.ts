import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type MesaComercialContagem = {
  total: number;
  valorTotal: number;
  recuperacaoQtd: number;
  recuperacaoValor: number;
  aguardandoPagamentoQtd: number;
  aguardandoPagamentoValor: number;
};

/**
 * FONTE-UNICA-DA-MESA-COMERCIAL (01/09/2026): card do funil e contador da aba
 * leem daqui. React Query deduplica pela queryKey — uma só ida ao banco.
 * Erro NÃO é engolido: propaga para quem consome decidir o FAIL-LOUD.
 */
export function useMesaComercialContagem() {
  return useQuery({
    queryKey: ["mesa-comercial-contagem"],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async (): Promise<MesaComercialContagem> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_oportunidades_comercial")
        .select("estagio, valor_em_jogo");
      if (error) throw error;
      const rows = (data ?? []) as Array<{ estagio: string | null; valor_em_jogo: number | null }>;

      let valorTotal = 0;
      let recuperacaoQtd = 0;
      let recuperacaoValor = 0;
      let aguardandoPagamentoQtd = 0;
      let aguardandoPagamentoValor = 0;

      for (const r of rows) {
        const v = Number(r.valor_em_jogo || 0);
        valorTotal += v;
        if (r.estagio === "recuperacao_venda") {
          recuperacaoQtd += 1;
          recuperacaoValor += v;
        } else if (r.estagio === "aguardando_pagamento") {
          aguardandoPagamentoQtd += 1;
          aguardandoPagamentoValor += v;
        }
      }

      return {
        total: rows.length,
        valorTotal,
        recuperacaoQtd,
        recuperacaoValor,
        aguardandoPagamentoQtd,
        aguardandoPagamentoValor,
      };
    },
  });
}
