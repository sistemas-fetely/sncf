import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { rawMessage } from "@/lib/format-error";
import { formatBRL } from "@/lib/format-currency";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

/**
 * CAPTURA-PARCIAL (22/09/2026). O portão passou a aceitar captura parcial: o operador
 * confirma o valor que DE FATO passou na maquininha e o saldo de cartão continua aberto
 * até a soma das capturas cobrir o plano. Quem valida valor, NSU e saldo é a RPC
 * `fn_confirmar_captura_cartao` — o front só desabilita botão por conveniência e mostra
 * a mensagem real do banco quando ela recusa.
 */
export interface CapturaArgs {
  pedido_id: string;
  valor: number;
  nsu: string;
  parcelas?: number | null;
  data_pagamento?: string | null;
  banco_recebimento_id?: string | null;
  adquirente_id?: string | null;
  bandeira?: string | null;
  observacao?: string | null;
}

export interface CapturaPrevia {
  ok?: boolean;
  simulacao?: boolean;
  pedido?: string;
  saldo_aberto_antes?: number;
  captura?: number;
  parcelas?: number;
  saldo_aberto_depois?: number;
  fecha_portao?: boolean;
}

export interface CapturaResultado {
  ok?: boolean;
  pedido?: string;
  captura_id?: string;
  captura_ordem?: number;
  valor?: number;
  parcelas?: number;
  saldo_aberto?: number;
  captura_saldo_id?: string | null;
  fechou_portao?: boolean;
  confirmacao?: string | null;
}

function params(args: CapturaArgs, simular: boolean) {
  return {
    p_pedido_id: args.pedido_id,
    p_valor: args.valor,
    p_nsu: args.nsu,
    p_parcelas: args.parcelas ?? null,
    ...(args.data_pagamento ? { p_data_pagamento: args.data_pagamento } : {}),
    p_banco_recebimento_id: args.banco_recebimento_id || null,
    p_adquirente_id: args.adquirente_id || null,
    p_bandeira: args.bandeira || null,
    p_observacao: args.observacao || null,
    p_simular: simular,
  };
}

/** Prévia em tempo real (p_simular = true): não escreve nada. */
export function usePreviaCapturaCartao(
  pedido_id: string | null | undefined,
  valor: number,
  parcelas: number,
  habilitado: boolean,
) {
  return useQuery({
    queryKey: ["captura-cartao-previa", pedido_id, valor, parcelas],
    enabled: !!pedido_id && habilitado && valor > 0,
    retry: false,
    staleTime: 0,
    queryFn: async (): Promise<CapturaPrevia> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "fn_confirmar_captura_cartao",
        // NSU de sondagem: a RPC recusa NSU sem dígito, e a simulação não grava nada.
        params(
          { pedido_id: pedido_id!, valor, nsu: "0", parcelas },
          true,
        ),
      );
      if (error) throw error;
      return (data ?? {}) as CapturaPrevia;
    },
  });
}

export function useConfirmarCapturaCartao() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: CapturaArgs): Promise<CapturaResultado> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(
        "fn_confirmar_captura_cartao",
        params(args, false),
      );
      if (error) throw error;
      return (data ?? {}) as CapturaResultado;
    },

    onSuccess: (res, args) => {
      const valor = res.valor ?? args.valor;
      if (res.fechou_portao) {
        toast({
          title: "Portão fechado",
          description: `Captura de ${formatBRL(valor)} confirmada: o plano de cartão está coberto e o pedido foi liberado.`,
        });
      } else {
        toast({
          title: "Captura confirmada",
          description: `Captura de ${formatBRL(valor)} confirmada. Falta ${formatBRL(res.saldo_aberto ?? 0)} em aberto neste pedido.`,
        });
      }
      invalidarPedido(qc, args.pedido_id);
      const keys: (readonly unknown[])[] = [
        ["captura-cartao-previa"],
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"],
        ["cobranca-fila"],
      ];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },

    onError: (e: unknown) => {
      console.error("[fn_confirmar_captura_cartao]", e);
      toast({
        title: "Erro ao confirmar a captura",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
