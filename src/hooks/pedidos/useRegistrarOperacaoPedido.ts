import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Args {
  pedido_id: string;
  tipo_evento: string;
  descricao: string;
  metadata?: Record<string, unknown>;
  proxima_acao?: string;
}

export function useRegistrarOperacaoPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, tipo_evento, descricao, metadata, proxima_acao }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_operacao_pedido", {
        p_pedido_id: pedido_id,
        p_tipo_evento: tipo_evento,
        p_descricao: descricao,
        p_metadata: metadata || null,
        p_proxima_acao: proxima_acao || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      invalidarPedido(qc, vars.pedido_id);
      toast({ title: "Operação registrada" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    },
  });
}
