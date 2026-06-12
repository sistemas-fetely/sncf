import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  novaRegraId: string;
  novaCondicao: string;
}

export function useAtualizarCondicaoPagamento(pedidoId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ novaRegraId, novaCondicao }: Args) => {
      const { data, error } = await (supabase as any).rpc(
        "atualizar_condicao_pagamento",
        {
          p_pedido_id:     pedidoId,
          p_nova_regra_id: novaRegraId,
          p_nova_condicao: novaCondicao,
        }
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Erro desconhecido");
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cobranca-proposta", pedidoId] });
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo", pedidoId] });
      toast({
        title: "Pagamento atualizado",
        description: "A proposta foi recalculada com a nova condição.",
      });
    },
    onError: (e: Error) => {
      console.error("[atualizar_condicao_pagamento]", e);
    },
  });
}
