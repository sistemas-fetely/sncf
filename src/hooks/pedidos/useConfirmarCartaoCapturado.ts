import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { rawMessage } from "@/lib/format-error";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Args {
  pedido_id: string;
  nsu: string;
  data_captura: string; // ISO (date ou timestamptz)
  valor_capturado?: number | null;
  observacao?: string | null;
  /** Adquirente da captura (`adquirente.id`) — quem está com o dinheiro até o repasse. */
  adquirente_id?: string | null;
}

export interface ConfirmarCartaoResult {
  ok?: boolean;
  pedido_id?: string;
  parcelas_confirmadas?: number;
  valor_total?: number;
  avancou?: boolean;
  portao_valor_faltando?: number;
}

const fmtBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Cartão em 3x é UMA autorização — as parcelas 2 e 3 são datas de repasse da
 * operadora, não novas cobranças. Esta RPC fecha todas as parcelas de cartão
 * em aberto do pedido de uma vez, com o mesmo NSU.
 */
export function useConfirmarCartaoCapturado() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (args: Args): Promise<ConfirmarCartaoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_cartao_capturado", {
        p_pedido_id: args.pedido_id,
        p_nsu: args.nsu.trim(),
        p_data_captura: args.data_captura,
        p_valor_capturado:
          args.valor_capturado === null || args.valor_capturado === undefined
            ? null
            : args.valor_capturado,
        p_observacao: args.observacao?.trim() || null,
        p_adquirente_id: args.adquirente_id || null,
      });
      if (error) throw error;
      return (data ?? {}) as ConfirmarCartaoResult;
    },

    onSuccess: (res, args) => {
      const qtd = Number(res.parcelas_confirmadas ?? 0);
      const total = Number(res.valor_total ?? 0);
      const base = `${qtd} parcela(s) de cartão confirmada(s) · ${fmtBRL.format(total)}.`;

      if (res.avancou) {
        toast({
          title: "Cartão capturado · pedido liberado",
          description: `${base} O pedido foi liberado.`,
        });
      } else {
        const falta = Number(res.portao_valor_faltando ?? 0);
        toast({
          title: "Cartão capturado",
          description:
            falta > 0
              ? `${base} Ainda faltam ${fmtBRL.format(falta)} em pagamentos para liberar o pedido.`
              : base,
        });
      }

      const pedidoId = res.pedido_id ?? args.pedido_id;
      invalidarPedido(qc, pedidoId);
      const keys: (readonly unknown[])[] = [
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"],
        ["cobranca-fila"],
      ];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },

    onError: (e: unknown) => {
      console.error("[confirmar_cartao_capturado]", e);
      toast({
        title: "Erro ao confirmar captura do cartão",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
