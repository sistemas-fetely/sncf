import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedido_id: string;
  motivo: string;
}

export interface CancelarPedidoResult {
  ok: boolean;
  pedido_id: string;
  estagio_anterior: string;
  titulos_cancelados: number;
  boletos_baixa_pendente: number;
  valor_credito_pendente: number;
  haver_id: string | null;
}

export function useCancelarPedido() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, motivo }: Args): Promise<CancelarPedidoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cancelar_pedido", {
        p_pedido_id: pedido_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data as CancelarPedidoResult;
    },
    // Invalidação deliberadamente removida daqui.
    // CancelarPedidoDialog invalida no onClose para não desmontar
    // o dialog antes do passo 2 ser exibido.
    onError: (e: Error) => {
      toast({
        title: "Erro ao cancelar",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
