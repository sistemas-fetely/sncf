import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CartaoAberto {
  parcelas: number;
  valor: number;
}

/**
 * CARTAO-E-CAPTURA-UNICA: uma autorização cobre a família inteira, e a prova é o NSU.
 * Para oferecer a captura na fila, a tela precisa saber quantas parcelas de cartão o
 * PEDIDO tem em aberto — não só a linha de portão que aparece na linha da tabela.
 * `confirmar_cartao_capturado` fecha todas elas de uma vez.
 */
export function useCartaoAbertoPorPedido(pedidoIds: string[]) {
  const ids = [...new Set(pedidoIds)].sort();

  return useQuery({
    queryKey: ["cartao-aberto-por-pedido", ids],
    enabled: ids.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<Record<string, CartaoAberto>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("pedido_id, valor")
        .in("pedido_id", ids)
        .eq("tipo_pagamento", "cartao")
        .eq("status", "prevista")
        .is("pago_em", null);

      if (error) throw error;

      const mapa: Record<string, CartaoAberto> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const linha of (data ?? []) as any[]) {
        const atual = mapa[linha.pedido_id] ?? { parcelas: 0, valor: 0 };
        atual.parcelas += 1;
        atual.valor += Number(linha.valor ?? 0);
        mapa[linha.pedido_id] = atual;
      }
      return mapa;
    },
  });
}
