import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";
import { rawMessage } from "@/lib/format-error";
import { useVoltarParaOrigem } from "@/hooks/useVoltarParaOrigem";

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
  const voltarPara = useVoltarParaOrigem("/recebimento/cobranca");

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
      navigate(voltarPara);
    },
    onError: (e: unknown) => {
      console.error("[materializar_cobranca_com_haver]", e);
      // Mensagem do banco vai crua (inclui details/hint da trigger de guarda de haver).
      // Sem retry, sem texto genérico: o operador precisa ler o motivo.
      toast({
        title: "Erro ao materializar com haver",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
