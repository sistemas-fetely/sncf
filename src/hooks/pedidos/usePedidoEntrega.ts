import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PedidoEntrega {
  pedido_id: string;
  id_externo: string | null;
  estagio: string | null;
  entregue_em: string | null;
  data_entrega: string | null;
  entregue_metodo: string | null;
  data_entrega_prevista: string | null;
  dias_vs_previsto: number | null;
  transportadora_id: string | null;
  transportadora_nome: string | null;
  transportadora_razao: string | null;
  transportadora_cnpj: string | null;
  frete_tipo: string | null;
  valor_frete: number | null;
  estimativa_frete_valor: number | null;
  frete_responsavel: string | null;
  transporte_origem: string | null;
  nf_numero: string | null;
  nf_data: string | null;
  eventos_rastreio: unknown;
  // Novas colunas vindas de transp_fretes (fatura real)
  custo_frete_real: number | null;
  margem_frete: number | null;
  cte_numero: string | null;
  frete_qtd_ctes: number | null;
  volumes: number | null;
  peso_real: number | null;
  peso_taxado: number | null;
  pct_frete_nf: number | null;
  prazo_transportadora: string | null;
  entrega_ocorrencia_texto: string | null;
  entrega_ocorrencia_classe: string | null;
  entrega_ocorrencia_problema: boolean | null;
  data_entrega_transportadora: string | null;
}

export function usePedidoEntrega(pedidoId: string | undefined, estagio: string | undefined) {
  const enabled = !!pedidoId && estagio === "entregue";
  return useQuery({
    queryKey: ["pedido-entrega", pedidoId],
    enabled,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_entrega")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      return data as PedidoEntrega | null;
    },
  });
}
