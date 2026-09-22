import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/format-currency";

/**
 * CAPTURA-DE-CARTAO (22/09/2026). Um pedido pode ter N capturas — o cliente paga
 * com mais de um cartão. Cada captura tem NSU, valor e número de parcelas próprios;
 * as parcelas do plano são os REPASSES daquela captura, não cobranças ao cliente.
 * Leitura direta de `captura_cartao` (o banco é quem valida tudo).
 */
export interface CapturaCartao {
  id: string;
  pedido_id: string;
  nsu: string | null;
  valor: number;
  parcelas: number | null;
  data_captura: string | null;
  bandeira: string | null;
  ordem: number | null;
  confirmada_em: string | null;
  observacao: string | null;
}

/** Rótulo do operador: "Cartão 1 · R$ 1.159,02 em 4x". */
export function rotuloCaptura(c: CapturaCartao): string {
  const n = c.ordem ?? 1;
  const partes = [`Cartão ${n}`, formatBRL(c.valor)];
  if (c.parcelas) partes.push(`em ${c.parcelas}x`);
  return partes.join(" · ");
}

export function useCapturasPedido(pedidoId: string | null | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["capturas-pedido", pedidoId],
    enabled: !!pedidoId && habilitado,
    queryFn: async (): Promise<CapturaCartao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("captura_cartao")
        .select("id, pedido_id, nsu, valor, parcelas, data_captura, bandeira, ordem, confirmada_em, observacao")
        .eq("pedido_id", pedidoId!)
        .order("ordem", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((c: any) => ({
        id: c.id as string,
        pedido_id: c.pedido_id as string,
        nsu: (c.nsu as string | null) ?? null,
        valor: Number(c.valor ?? 0),
        parcelas: (c.parcelas as number | null) ?? null,
        data_captura: (c.data_captura as string | null) ?? null,
        bandeira: (c.bandeira as string | null) ?? null,
        ordem: (c.ordem as number | null) ?? null,
        confirmada_em: (c.confirmada_em as string | null) ?? null,
        observacao: (c.observacao as string | null) ?? null,
      }));
    },
  });
}

/** Vínculo parcela → captura (e estado pago), para a lista do plano de recebimento. */
export interface ProvisaoCaptura {
  id: string;
  captura_id: string | null;
  tipo_pagamento: string | null;
  valor: number;
  pago_em: string | null;
  status: string | null;
}

export function useProvisoesCaptura(pedidoId: string | null | undefined, habilitado = true) {
  return useQuery({
    queryKey: ["provisoes-captura", pedidoId],
    enabled: !!pedidoId && habilitado,
    queryFn: async (): Promise<ProvisaoCaptura[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("provisao_recebimento")
        .select("id, captura_id, tipo_pagamento, valor, pago_em, status")
        .eq("pedido_id", pedidoId!)
        .order("numero_parcela", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((p: any) => ({
        id: p.id as string,
        captura_id: (p.captura_id as string | null) ?? null,
        tipo_pagamento: (p.tipo_pagamento as string | null) ?? null,
        valor: Number(p.valor ?? 0),
        pago_em: (p.pago_em as string | null) ?? null,
        status: (p.status as string | null) ?? null,
      }));
    },
  });
}
