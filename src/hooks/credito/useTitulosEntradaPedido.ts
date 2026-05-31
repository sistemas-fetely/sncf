import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TituloEntradaPedido } from "@/types/credito";

export function useTitulosEntradaPedido(pedidoId: string | undefined) {
  return useQuery({
    queryKey: ["titulos-entrada-pedido", pedidoId],
    enabled: !!pedidoId,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select(
          "id, numero_titulo, numero_parcela, total_parcelas, tipo_pagamento, valor_bruto, data_vencimento_atual, status, data_pagamento, eh_entrada",
        )
        .eq("pedido_id", pedidoId)
        .eq("eh_entrada", true)
        .order("numero_parcela", { ascending: true });

      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapped: TituloEntradaPedido[] = (data || []).map((r: any) => ({
        titulo_id: r.id,
        numero_titulo: r.numero_titulo ?? "",
        numero_parcela: r.numero_parcela ?? 1,
        total_parcelas: r.total_parcelas ?? 1,
        tipo_pagamento: r.tipo_pagamento,
        valor_bruto: Number(r.valor_bruto ?? 0),
        data_vencimento_atual: r.data_vencimento_atual,
        status: r.status,
        data_pagamento: r.data_pagamento,
      }));

      return mapped;
    },
  });
}
