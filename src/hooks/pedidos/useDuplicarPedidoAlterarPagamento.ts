import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedidoId: string;
  novaRegraId: string;
  novaCondicao: string;
}

export function useDuplicarPedidoAlterarPagamento() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, novaRegraId, novaCondicao }: Args) => {
      const { data, error } = await (supabase as any).rpc(
        "duplicar_pedido_alterar_pagamento",
        {
          p_pedido_id: pedidoId,
          p_nova_regra_id: novaRegraId,
          p_nova_condicao: novaCondicao,
        }
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Erro desconhecido");
      return data as { ok: true; novo_pedido_id: string; novo_id_externo: string };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta"] });
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-fila"] });
      toast({
        title: "Pagamento alterado",
        description: `Novo pedido criado: ${data.novo_id_externo}`,
      });
      navigate(`/pedidos/${data.novo_pedido_id}`);
    },
    onError: (e: Error) => {
      console.error("[duplicar_pedido_alterar_pagamento]", e);
    },
  });
}
