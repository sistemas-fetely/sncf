import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DefinirPortaoPayload {
  pedido_id: string;
  valor: boolean | null;
  motivo?: string;
}

export function useDefinirPortaoAnalise() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (payload: DefinirPortaoPayload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("definir_portao_analise", {
        p_pedido_id: payload.pedido_id,
        p_valor: payload.valor,
        p_motivo: payload.motivo ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["analise-detalhe"] });
      qc.invalidateQueries({ queryKey: ["analises-fila"] });
      qc.invalidateQueries({ queryKey: ["pedido", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      toast({
        title: "Regra de liberação salva",
        description:
          vars.valor === null
            ? "Voltou a seguir a regra da forma de pagamento."
            : vars.valor
              ? "Pagamento exigido antes de liberar."
              : "Pedido libera sem esperar o pagamento.",
      });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao definir regra de liberação",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
