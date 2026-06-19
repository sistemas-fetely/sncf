import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TituloCompleto {
  id: string;
  numero_titulo: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor_bruto: number;
  valor_atual: number | null;
  data_vencimento_atual: string | null;
  status: string;
  tipo_pagamento: string | null;
  nf_id: string | null;
  pedido_id: string | null;
  razao_social: string | null;
  cnpj: string | null;
  id_externo: string | null;
}

export function useTodosTitulos() {
  return useQuery({
    queryKey: ["todos-titulos"],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<TituloCompleto[]> => {
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          `
          id, numero_titulo, numero_parcela, total_parcelas,
          valor_bruto, valor_atual, data_vencimento_atual,
          status, tipo_pagamento, nf_id, pedido_id,
          conta:contas_pagar_receber(
            parceiro:parceiros_comerciais(razao_social, cnpj)
          ),
          pedido:pedidos(id_externo)
        `
        )
        .order("data_vencimento_atual", { ascending: false })
        .limit(500);

      if (error) throw error;

      return ((data || []) as any[]).map((r) => ({
        id: r.id,
        numero_titulo: r.numero_titulo ?? "",
        numero_parcela: r.numero_parcela ?? null,
        total_parcelas: r.total_parcelas ?? null,
        valor_bruto: Number(r.valor_bruto ?? 0),
        valor_atual: r.valor_atual ? Number(r.valor_atual) : null,
        data_vencimento_atual: r.data_vencimento_atual ?? null,
        status: r.status ?? "",
        tipo_pagamento: r.tipo_pagamento ?? null,
        nf_id: r.nf_id ?? null,
        pedido_id: r.pedido_id ?? null,
        razao_social: r.conta?.parceiro?.razao_social ?? null,
        cnpj: r.conta?.parceiro?.cnpj ?? null,
        id_externo: r.pedido?.id_externo ?? null,
      }));
    },
  });
}
