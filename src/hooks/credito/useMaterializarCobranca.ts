import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";
import { rawMessage } from "@/lib/format-error";

interface Args {
  pedidoId: string;
  titulosEditados: TituloProposto[];
}

export function useMaterializarCobranca() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, titulosEditados }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("materializar_cobranca", {
        p_pedido_id: pedidoId,
        p_titulos_editados: titulosEditados,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta"] });
      toast({
        title: "Cobrança materializada",
        description: "Títulos criados e pedido avançado.",
      });
      navigate("/recebimento/cobranca");
    },
    onError: (e: unknown) => {
      console.error("[materializar_cobranca]", e);
      // Mensagem do banco vai crua (inclui details/hint da trigger de guarda de haver).
      // Sem retry, sem texto genérico: o operador precisa ler o motivo.
      toast({
        title: "Erro ao materializar cobrança",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
