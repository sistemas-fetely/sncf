import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

/**
 * CAPTURA-DE-CARTAO (22/09/2026). Reescreve o plano de cartão do pedido em N capturas.
 * Quem valida soma, parcelas e estado pago é a RPC `fn_dividir_captura_cartao` — o front
 * só desabilita o botão por conveniência e mostra a mensagem real do banco quando recusa.
 */
export interface CapturaEntrada {
  valor: number;
  parcelas: number;
  nsu?: string | null;
  bandeira?: string | null;
  adquirente_id?: string | null;
  banco_recebimento_id?: string | null;
}

export interface LinhaDepois {
  parcela: number | null;
  captura: number | null;
  valor: number | null;
  data: string | null;
}

export interface DividirResult {
  ok?: boolean;
  simulacao?: boolean;
  pedido?: string;
  total?: number;
  antes?: { parcela: number | null; valor: number | null; data: string | null }[];
  depois?: LinhaDepois[];
  capturas?: number;
  linhas?: number;
}

interface Args {
  pedido_id: string;
  capturas: CapturaEntrada[];
  simular: boolean;
}

export function useDividirCapturaCartao() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: Args): Promise<DividirResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_dividir_captura_cartao", {
        p_pedido_id: args.pedido_id,
        p_capturas: args.capturas,
        p_simular: args.simular,
      });
      if (error) throw error;
      return (data ?? {}) as DividirResult;
    },

    onSuccess: (res, args) => {
      if (args.simular) return; // Pré-visualização não mexe em nada e não avisa nada.
      toast({
        title: "Divisão aplicada",
        description: `${res.capturas ?? args.capturas.length} cartão(ões) · ${res.linhas ?? 0} parcela(s) reescritas no plano.`,
      });
      invalidarPedido(qc, args.pedido_id);
      const keys: (readonly unknown[])[] = [
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"],
        ["cobranca-fila"],
      ];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },

    onError: (e: unknown) => {
      console.error("[fn_dividir_captura_cartao]", e);
      toast({
        title: "Erro ao dividir entre cartões",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
