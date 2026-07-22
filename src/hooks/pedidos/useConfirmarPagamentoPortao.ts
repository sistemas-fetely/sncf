import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedido_id: string;
  data_pagamento: string; // YYYY-MM-DD
  observacao?: string;
}

interface Result {
  ok: boolean;
  titulos_criados?: number;
  total_parcelas?: number;
}

/**
 * Hook único de confirmação de pagamento de portão.
 * Chama SOMENTE a RPC `confirmar_portao_pago`, que:
 *  - marca o portão como pago,
 *  - materializa titulo_a_receber (gate + parcelas),
 *  - avança a fase do pedido via trigger.
 *
 * Não insere evento na timeline nem chama transicionar_pedido no front.
 */
export function useConfirmarPagamentoPortao() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, data_pagamento, observacao }: Args): Promise<Result> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("confirmar_portao_pago", {
        p_pedido_id: pedido_id,
        p_data_pagamento: data_pagamento,
        p_observacao: observacao?.trim() || null,
      });
      if (error) throw error;
      return (data ?? { ok: true }) as Result;
    },

    onSuccess: (res, vars) => {
      const titulos = res.titulos_criados ?? 0;
      const parcelas = res.total_parcelas ?? 0;
      toast({
        title: "Pagamento confirmado",
        description:
          titulos > 0 || parcelas > 0
            ? `${titulos} título(s), ${parcelas} parcela(s). Pedido avançou pra pré-faturamento.`
            : "Pedido avançou pra pré-faturamento.",
      });

      const keys: (readonly unknown[])[] = [
        ["pedido-detalhe", vars.pedido_id],
        ["pedido-portao-provisorio", vars.pedido_id],
        ["pedidos-fila"],
        ["pedidos-pipeline"],
        ["contas-receber-titulos"],
        ["primeiro-pagamento-fila"],
        ["cobranca-fila"],
        ["aguardando-pagamento-fila"],
      ];
      keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
    },

    onError: (e: Error) => {
      toast({
        title: "Erro ao confirmar pagamento",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
