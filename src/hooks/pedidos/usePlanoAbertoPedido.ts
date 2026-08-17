import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LinhaPlanoAberta {
  id: string;
  numero_parcela: number | null;
  total_parcelas: number | null;
  valor: number;
  data_prevista: string | null;
  tipo_pagamento: string | null;
  eh_portao: boolean | null;
}

/** Meio de pagamento canônico da linha do plano. */
export function meioDaLinha(l: LinhaPlanoAberta): string {
  return (l.tipo_pagamento ?? "").toLowerCase();
}

export const ROTULO_MEIO: Record<string, string> = {
  cartao: "cartão",
  pix: "PIX",
  boleto: "boleto",
  haver: "haver",
  conta_corrente: "conta corrente",
};

export function rotuloMeio(meio: string | null | undefined): string {
  if (!meio) return "sem meio definido";
  return ROTULO_MEIO[meio.toLowerCase()] ?? meio;
}

/**
 * Linhas do plano do pedido (`provisao_recebimento`) ainda em aberto.
 * Fonte única para a tela saber POR MEIO o que falta confirmar —
 * cartão é captura única, PIX e boleto são linha a linha.
 */
export function usePlanoAbertoPedido(pedido_id: string | null | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["plano-aberto-pedido", pedido_id],
    enabled: !!pedido_id && habilitado,
    queryFn: async (): Promise<LinhaPlanoAberta[]> => {
      const { data, error } = await supabase
        .from("provisao_recebimento")
        .select("id, numero_parcela, total_parcelas, valor, data_prevista, tipo_pagamento, eh_portao")
        .eq("pedido_id", pedido_id!)
        .is("pago_em", null)
        .order("numero_parcela", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((l) => ({
        id: l.id as string,
        numero_parcela: l.numero_parcela as number | null,
        total_parcelas: l.total_parcelas as number | null,
        valor: Number(l.valor ?? 0),
        data_prevista: (l.data_prevista as string | null) ?? null,
        tipo_pagamento: (l.tipo_pagamento as string | null) ?? null,
        eh_portao: (l.eh_portao as boolean | null) ?? null,
      }));
    },
  });
}
