import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface Params {
  pedido_id: string;
  pedido_origem_id: string | null; // null = desvincular
}

export function useVincularComplementar() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, pedido_origem_id }: Params) => {
      const { error } = await (supabase as any)
        .from("pedidos")
        .update({ pedido_origem_id })
        .eq("id", pedido_id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      const msg = vars.pedido_origem_id ? "Pedido vinculado como complementar" : "Vínculo removido";
      toast({ title: msg });
      invalidarPedido(qc, vars.pedido_id);
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao vincular", description: e.message, variant: "destructive" });
    },
  });
}
