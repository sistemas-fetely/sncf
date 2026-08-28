import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

export function useReanalisarPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id }: { pedido_id: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("analisar_pedido_vs_programa", {
        p_pedido_id: pedido_id,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      invalidarPedido(qc, vars.pedido_id);
      toast({ title: "Análise reexecutada" });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao reanalisar",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
