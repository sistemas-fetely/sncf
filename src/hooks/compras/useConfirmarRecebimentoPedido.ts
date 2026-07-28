import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ConfirmarRecebimentoResult {
  pedido_id: string;
  status: string;
  recebido_em: string;
  itens_recebidos: number;
  dias_atraso: number;
}

export function useConfirmarRecebimentoPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pedido_id: string; observacao?: string | null }) => {
      const { data, error } = await supabase.rpc("confirmar_recebimento_pedido", {
        p_pedido_id: input.pedido_id,
        p_observacao: input.observacao ?? null,
      });
      if (error) throw error;
      return data as unknown as ConfirmarRecebimentoResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
    },
  });
}
