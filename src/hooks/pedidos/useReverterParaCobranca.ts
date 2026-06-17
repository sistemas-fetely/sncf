import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function useReverterParaCobranca() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pedidoId: string) => {
      const { data, error } = await (supabase as any).rpc(
        "reverter_para_cobranca",
        { p_pedido_id: pedidoId }
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro ?? "Erro desconhecido");
      return data as { ok: true; estagio_origem: string };
    },
    onSuccess: (_data, pedidoId) => {
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-fila"] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-titulos", pedidoId] });
      toast({
        title: "Pedido revertido",
        description: "Pedido voltou para cobrança. Títulos cancelados.",
      });
      navigate(`/recebimento/cobranca/${pedidoId}`);
    },
    onError: (e: Error) => {
      console.error("[reverter_para_cobranca]", e);
      // Erro tratado inline no dialog
    },
  });
}
