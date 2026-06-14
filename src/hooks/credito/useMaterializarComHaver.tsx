import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";

interface Args {
  pedidoId: string;
  titulosEditados: TituloProposto[];
  haverId: string;
  valorHaver: number;
}

export function useMaterializarComHaver() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, titulosEditados, haverId, valorHaver }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("materializar_cobranca_com_haver", {
        p_pedido_id: pedidoId,
        p_titulos_editados: titulosEditados,
        p_haver_id: haverId,
        p_valor_haver: valorHaver,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta"] });
      qc.invalidateQueries({ queryKey: ["haver-disponivel"] });
      qc.invalidateQueries({ queryKey: ["cliente-detalhe"] });
      toast({
        title: "Cobrança materializada com haver",
        description: "Haver aplicado e títulos criados.",
      });
      navigate("/recebimento/cobranca");
    },
    onError: (e: Error) => {
      console.error("[materializar_cobranca_com_haver]", e);
      toast({
        title: "Erro ao materializar com haver",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
