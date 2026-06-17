import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DividirParams {
  remessaOrigemId: string;
  pedidoId: string;
  itensParaNova: { indice: number; quantidade: number }[];
}

export function useDividirRemessa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ remessaOrigemId, itensParaNova }: DividirParams) => {
      const { data, error } = await (supabase as any).rpc("dividir_remessa", {
        p_remessa_origem_id: remessaOrigemId,
        p_itens_para_nova: itensParaNova,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any, vars) => {
      qc.invalidateQueries({ queryKey: ["remessas"] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      const codigo = data?.nova?.codigo ?? "nova remessa";
      toast.success(`Remessa dividida — ${codigo} criada`);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : (err as any)?.message ?? "Erro ao dividir remessa";
      console.error("useDividirRemessa error:", err);
      toast.error(msg);
    },
  });
}
