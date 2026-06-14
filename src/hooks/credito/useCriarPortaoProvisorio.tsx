import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { TituloProposto } from "@/types/credito";

interface Args {
  pedidoId: string;
  titulosEditados: TituloProposto[];
}

export function useCriarPortaoProvisorio() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, titulosEditados }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("criar_portao_provisorio", {
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
        title: "Portão criado",
        description: "O pedido vai aguardar o primeiro pagamento à vista para liberar a NF.",
      });
      navigate("/recebimento/cobranca");
    },
    onError: (e: Error) => {
      console.error("[criar_portao_provisorio]", e);
      toast({
        title: "Erro ao criar portão",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
