import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  pedido_id: string;
  motivo: string;
}

export function useCancelarPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, motivo }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("cancelar_pedido", {
        p_pedido_id: pedido_id,
        p_motivo: motivo,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      toast({ title: "Pedido cancelado" });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao cancelar",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
