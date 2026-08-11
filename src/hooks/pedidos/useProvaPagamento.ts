import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProvaPagamento {
  pedido_id: string;
  pedido: string | null;
  valor_liquido: number;
  valor_recebido: number;
  valor_sem_prova: number;
  lancamentos: number;
  nivel_prova: string;
  prova_rotulo: string;
  prova_tom: "ok" | "alerta" | "perigo" | "neutro";
  libera_despacho: boolean;
  exige_confirmacao: boolean;
  prova_frase: string;
  fonte_coberta_ate: string | null;
  fonte_dias_atras: number | null;
}

/**
 * Prova de pagamento do pedido. O veredito vale pelo elo mais fraco entre
 * adiantamento (pré-NF) e título pago (pós-NF).
 * Nunca bloqueia sozinho — entrega a frase para o humano decidir.
 */
export function useProvaPagamento(pedidoId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["prova-pagamento", pedidoId],
    enabled: !!pedidoId && enabled,
    staleTime: 15 * 1000,
    queryFn: async (): Promise<ProvaPagamento | null> => {
      if (!pedidoId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("vw_pedido_prova_pagamento")
        .select("*")
        .eq("pedido_id", pedidoId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        valor_liquido: Number(data.valor_liquido ?? 0),
        valor_recebido: Number(data.valor_recebido ?? 0),
        valor_sem_prova: Number(data.valor_sem_prova ?? 0),
        lancamentos: Number(data.lancamentos ?? 0),
      } as ProvaPagamento;
    },
  });
}
