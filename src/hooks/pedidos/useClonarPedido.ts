import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Args {
  pedido_id: string;
}

interface ClonarPedidoResult {
  ok: boolean;
  clone_id: string;
  clone_id_externo: string;
}

export function useClonarPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ pedido_id }: Args): Promise<ClonarPedidoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("clonar_pedido_cancelado", {
        p_pedido_id: pedido_id,
      });
      if (error) throw error;
      return data as ClonarPedidoResult;
    },
    onSuccess: (data) => {
      invalidarPedido(qc, null);
      toast({ title: `Pedido substituto criado: ${data.clone_id_externo}` });
      navigate(`/pedidos/${data.clone_id}`);
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao criar substituto",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
