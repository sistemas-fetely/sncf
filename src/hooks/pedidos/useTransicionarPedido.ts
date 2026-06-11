import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { EstagioPedido } from "@/types/pedido";

interface Args {
  pedido_id: string;
  para_estagio: EstagioPedido;
  proxima_acao?: string;
  motivo?: string;
}

export function useTransicionarPedido() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, para_estagio, proxima_acao, motivo }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("transicionar_pedido", {
        p_pedido_id: pedido_id,
        p_para_estagio: para_estagio,
        p_proxima_acao: proxima_acao ?? null,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", variables.pedido_id] });
      toast({ title: "Pedido avançado" });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao avançar", description: e.message, variant: "destructive" });
    },
  });
}
