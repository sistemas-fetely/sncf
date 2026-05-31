import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Args {
  tituloId: string;
  dataPagamento: string; // YYYY-MM-DD
  observacao?: string;
}

export function useMarcarTituloPago() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ tituloId, dataPagamento, observacao }: Args) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("marcar_titulo_pago", {
        p_titulo_id: tituloId,
        p_data_pagamento: dataPagamento,
        p_observacao: observacao ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-fila"] });
      qc.invalidateQueries({ queryKey: ["titulos-entrada-pedido"] });
      qc.invalidateQueries({ queryKey: ["aguardando-pagamento-pedido"] });
      toast({
        title: "Título marcado como pago",
        description: "Pagamento registrado com sucesso.",
      });
    },
    onError: (e: Error) => {
      console.error("[marcar_titulo_pago]", e);
      toast({
        title: "Erro ao marcar pagamento",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
