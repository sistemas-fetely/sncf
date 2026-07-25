import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FreteB2C {
  lancamento_id: string;
  carrier: string;
  etiqueta: string | null;
  data_postagem: string | null;
  codigo_servico: string | null;
  descricao_servico: string | null;
  custo_frete: number | null;
  custo_transportadora: number | null;
  valor_declarado: number | null;
  cep_destino: string | null;
  municipio_destino: string | null;
  uf_destino: string | null;
  shopify_id: string | null;
  order_name: string | null;
  fulfillment_status: string | null;
  financial_status: string | null;
  shipping_zip: string | null;
  shipping_city: string | null;
  shipping_province: string | null;
  tem_pedido: boolean | null;
  situacao_frete: "enviado" | "pendente" | "sem_pedido" | string | null;
}

export function useFretesB2C(carrier: "Correios" | "Frenet") {
  return useQuery({
    queryKey: ["logistica", "fretes-b2c", carrier],
    queryFn: async (): Promise<FreteB2C[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_frete_b2c")
        .select("*")
        .eq("carrier", carrier)
        .order("data_postagem", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FreteB2C[];
    },
    staleTime: 60 * 1000,
  });
}
