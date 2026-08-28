import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface DividirParams {
  remessaOrigemId: string;
  pedidoId: string;
  itensParaNova: { indice: number; quantidade: number }[];
}

export function useDividirRemessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ remessaOrigemId, itensParaNova }: DividirParams) => {
      const { data, error } = await (supabase as any).rpc("dividir_remessa", {
        p_remessa_origem_id: remessaOrigemId,
        p_itens_para_nova: itensParaNova,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any, vars) => {
      invalidarPedido(qc, vars.pedidoId);
      // Vocabulario de UI: `pedido_remessa` e tentativa de envio, nao remessa /NN.
      toast.success("Envio dividido — nova tentativa criada");
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : (err as any)?.message ?? "Erro ao dividir o envio";
      console.error("useDividirRemessa error:", err);
      toast.error(msg);
    },
  });
}
