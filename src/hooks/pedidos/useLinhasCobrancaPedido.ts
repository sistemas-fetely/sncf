import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * LINHA-DE-COBRANCA-E-UMA-SO (28/08/2026): `vw_pedido_linhas_cobranca` unifica
 * provisão (pré-NF) e título (pós-NF) numa linha por parcela. A tela de cobrança
 * lê só daqui — nunca das duas tabelas em paralelo.
 */
export interface LinhaCobrancaPedido {
  pedido_id: string;
  origem: "provisao" | "titulo";
  linha_id: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor: number | string | null;
  data_vencimento: string | null;
  tipo_pagamento: string | null;
  eh_portao: boolean | null;
  eh_entrada: boolean | null;
  pago: boolean | null;
  pago_em: string | null;
  link_pagamento: string | null;
  pix_txid: string | null;
  pix_token: string | null;
  pix_qr_url: string | null;

  linha_digitavel: string | null;
  boleto_status: string | null;
  nosso_numero: string | null;
  condicao_pagamento: string | null;
  estado: "pago" | "vencido" | "vence_hoje" | "a_vencer" | "sem_data";
  dias_atraso: number | null;
  dias_para_vencer: number | null;
  instrumento_pronto: boolean | null;
}

export function useLinhasCobrancaPedido(pedidoId?: string | null) {
  return useQuery({
    queryKey: ["linhas-cobranca-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_linhas_cobranca")
        .select("*")
        .eq("pedido_id", pedidoId)
        .order("numero_parcela", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinhaCobrancaPedido[];
    },
  });
}
