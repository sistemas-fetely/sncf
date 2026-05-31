import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { UrgenciaDeclarada } from "@/types/pedido";

interface Args {
  pedidoId: string;
  urgencia: UrgenciaDeclarada;
  observacao?: string | null;
}

export function useAtualizarUrgencia() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ pedidoId, urgencia, observacao }: Args) => {
      const obs = observacao && observacao.trim().length > 0 ? observacao.trim() : null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("pedidos")
        .update({
          urgencia_declarada: urgencia,
          urgencia_observacao: obs,
        })
        .eq("id", pedidoId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      toast.success("Urgência atualizada");
      qc.invalidateQueries({ queryKey: ["fila-pedidos-priorizada"] });
      qc.invalidateQueries({ queryKey: ["pedido-priorizado", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Erro ao salvar urgência";
      toast.error(msg);
    },
  });
}
