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
}

export function usePedidoEntrega(pedidoId: string | undefined, estagio: string | undefined) {
  const enabled = !!pedidoId && (estagio === "entregue" || estagio === "em_transporte");
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
