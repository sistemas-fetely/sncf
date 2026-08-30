import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * PORTAO-EXISTE-SE-TEM-LINHA: a existência do portão é `existe linha em
 * pedido_portao com status provisorio` — NUNCA "vencimento não é nulo".
 * PIX antecipado é portão legítimo sem vencimento relevante.
 * Fonte única: quem precisar do portão pendente de um pedido usa este hook.
 */
export interface PortaoAtual {
  linhas: number;
  tipo: string | null;
  valor: number;
  vencimento: string | null;
  linkPagamento: string | null;
}

export function usePedidoPortaoAtual(pedidoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["pedido-portao-atual", pedidoId],
    enabled: !!pedidoId && enabled,
    queryFn: async (): Promise<PortaoAtual | null> => {
      const { data, error } = await supabase
        .from("pedido_portao")
        .select("id, sequencia, tipo_pagamento, valor, data_vencimento, link_pagamento")
        .eq("pedido_id", pedidoId!)
        .eq("status", "provisorio")
        .order("sequencia", { ascending: true });
      // FAIL-LOUD: erro sobe, a tela nunca finge que não existe portão.
      if (error) throw error;
      const linhas = data ?? [];
      if (linhas.length === 0) return null;
      const primeira = linhas[0];
      return {
        linhas: linhas.length,
        tipo: primeira.tipo_pagamento ?? null,
        valor: linhas.reduce((s, l) => s + Number(l.valor || 0), 0),
        vencimento: primeira.data_vencimento ?? null,
        linkPagamento: linhas.find((l) => l.link_pagamento)?.link_pagamento ?? null,
      };
    },
  });
}
