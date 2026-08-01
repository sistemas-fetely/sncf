import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Leitura única da view vw_ciclo_titulo (grão título, ~271 linhas).
 * A view é pequena: buscamos tudo de uma vez e filtramos no client.
 * Somente leitura — nenhuma mutation.
 */
export interface CicloTituloRow {
  titulo_id: string;
  numero_titulo: string | null;
  numero_parcela: number | null;
  total_parcelas: number | null;
  pedido_id: string | null;
  pedido_ref: string | null;
  data_pedido: string | null;
  mes_pedido: string | null;
  estagio: string | null;
  cliente: string | null;
  nf_id: string | null;
  nf_ref: string | null;
  nf_data: string | null;
  mes_competencia: string | null;
  tipo_pagamento: string | null;
  forma_nome: string | null;
  gera_caixa: boolean | null;
  banco_recebimento: string | null;
  status: string | null;
  valor_bruto: number | null;
  valor_atual: number | null;
  data_vencimento_atual: string | null;
  data_pagamento: string | null;
  data_liquidacao_prevista: string | null;
  ancora_regua: string | null;
  movimentacao_id: string | null;
  mov_data: string | null;
  mov_valor: number | null;
  mes_caixa: string | null;
  mov_classe: string | null;
  mov_conciliado: boolean | null;
  mov_conta: string | null;
  mov_descricao: string | null;
  quitado_por_haver: boolean | null;
  haver_cliente_total: number | null;
  haver_cliente_saldo: number | null;

  elo_caixa: string | null;
}

export function useFluxoCompetencia() {
  return useQuery({
    queryKey: ["fluxo-competencia", "vw_ciclo_titulo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_ciclo_titulo")
        .select("*");
      if (error) throw error;
      return (data ?? []) as CicloTituloRow[];
    },
  });
}
