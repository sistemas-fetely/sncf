import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Doutrina HAVER-É-PAGAMENTO: crédito de cliente aplicado a um pedido nasce
 * como título `tipo_pagamento = 'haver'` já PAGO. `pedidos.valor_liquido` NÃO
 * muda — ele é o snapshot da venda. Portanto quem quer saber "quanto ainda há
 * a cobrar" precisa descontar os títulos já pagos, nunca mexer no líquido.
 *
 * 13/08/2026 — CRÉDITO PARCIAL TAMBÉM É PAGAMENTO. Quando o crédito não cobre o
 * pedido inteiro não nasce título de haver: nasce `adiantamento_cliente` vinculado
 * ao pedido. Quem soma só título enxerga zero e propõe cobrar o valor cheio.
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
  /** Soma dos adiantamentos vinculados ao pedido com saldo (crédito/portão/split). */
  somaAdiantamento: number;
  /** Tudo que já é dinheiro do cliente neste pedido: títulos pagos + adiantamento vinculado. */
  totalAbatido: number;
  temHaver: boolean;
  /** Crédito do cliente abatido deste pedido, exista título de haver ou não. */
  creditoAplicado: number;
  /** De onde veio o crédito, para a tela nomear a linha. */
  fonteCredito: "titulo_haver" | "haver_aplicado" | "adiantamento_vinculado" | null;
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

      const { data: adiantData, error: adiantErr } = await (supabase as any)
        .from("adiantamento_cliente")
        .select("saldo, status")
        .eq("pedido_id", pedidoId)
        .in("status", ["disponivel", "parcial"]);
      if (adiantErr) throw adiantErr;

      const somaAdiantamento = (adiantData ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, a: any) => acc + Number(a.saldo ?? 0),
        0,
      );

      const { data: haverData, error: haverErr } = await (supabase as any)
        .from("haver_aplicacao")
        .select("valor_aplicado")
        .eq("pedido_id", pedidoId);
      if (haverErr) throw haverErr;
      const somaHaverAplicado = (haverData ?? []).reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, h: any) => acc + Number(h.valor_aplicado ?? 0),
        0,
      );

      /**
       * HAVER-É-PAGAMENTO, agora também ANTES DA NF. O crédito existe em até três
       * lugares para o mesmo dinheiro: título de haver (pós-faturamento),
       * `haver_aplicacao` (o abatimento em si) e `adiantamento_cliente` vinculado.
       * GREATEST, nunca soma — somar contaria o mesmo real duas ou três vezes.
       * Mesma regra de `fn_pedido_tem_lastro`.
       */
      const creditoAplicado = Math.max(somaHaver, somaHaverAplicado, somaAdiantamento);
      const fonteCredito =
        creditoAplicado <= 0.005
          ? null
          : somaHaver >= creditoAplicado - 0.005
            ? ("titulo_haver" as const)
            : somaHaverAplicado >= creditoAplicado - 0.005
              ? ("haver_aplicado" as const)
              : ("adiantamento_vinculado" as const);

      return {
        titulos: vivos,
        somaHaver,
        somaPagos,
        somaAdiantamento,
        totalAbatido: somaPagos + somaAdiantamento,
        temHaver: somaHaver > 0.005,
        creditoAplicado,
        fonteCredito,
      };
    },
  });
}

