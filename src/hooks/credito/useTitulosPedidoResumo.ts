import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Doutrina HAVER-É-PAGAMENTO: crédito de cliente aplicado a um pedido nasce
 * como título `tipo_pagamento = 'haver'` já PAGO. `pedidos.valor_liquido` NÃO
 * muda — ele é o snapshot da venda. Portanto quem quer saber "quanto ainda há
 * a cobrar" precisa descontar os títulos já pagos, nunca mexer no líquido.
 *
 * Somente leitura. Nenhuma escrita, nenhuma RPC.
 */

const STATUS_PAGOS = ["pago", "pago_com_atraso", "pago_judicial"];

export interface TituloResumoLinha {
  id: string;
  tipo_pagamento: string | null;
  status: string | null;
  valor_bruto: number;
  data_vencimento_atual: string | null;
}

export interface TitulosPedidoResumo {
  titulos: TituloResumoLinha[];
  /** Soma dos títulos de haver não cancelados (crédito aplicado ao pedido). */
  somaHaver: number;
  /** Soma de TODOS os títulos não cancelados já liquidados (qualquer meio). */
  somaPagos: number;
  temHaver: boolean;
}

export function useTitulosPedidoResumo(pedidoId?: string | null) {
  return useQuery({
    queryKey: ["titulos-pedido-resumo", pedidoId],
    enabled: !!pedidoId,
    queryFn: async (): Promise<TitulosPedidoResumo> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("titulo_a_receber")
        .select("id, tipo_pagamento, status, valor_bruto, data_vencimento_atual")
        .eq("pedido_id", pedidoId);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vivos: TituloResumoLinha[] = (data ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((t: any) => t.status !== "cancelado")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((t: any) => ({
          id: t.id,
          tipo_pagamento: t.tipo_pagamento ?? null,
          status: t.status ?? null,
          valor_bruto: Number(t.valor_bruto ?? 0),
          data_vencimento_atual: t.data_vencimento_atual ?? null,
        }));

      const somaHaver = vivos
        .filter((t) => t.tipo_pagamento === "haver")
        .reduce((acc, t) => acc + t.valor_bruto, 0);
      const somaPagos = vivos
        .filter((t) => STATUS_PAGOS.includes(String(t.status)))
        .reduce((acc, t) => acc + t.valor_bruto, 0);

      return { titulos: vivos, somaHaver, somaPagos, temHaver: somaHaver > 0.005 };
    },
  });
}
