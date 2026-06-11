import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DadosEnvio {
  pedidoId: string;
  transportadoraId: string | null;
  pesoBrutoTotal: number;
  freteTipo: string | null;
  valorFrete: number;
}

export function useSalvarDadosEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, transportadoraId, pesoBrutoTotal, freteTipo, valorFrete }: DadosEnvio) => {
      const { error } = await (supabase as any)
        .from("pedidos")
        .update({
          transportadora_id: transportadoraId || null,
          peso_bruto_total: pesoBrutoTotal,
          frete_tipo: freteTipo || null,
          valor_frete: valorFrete,
        })
        .eq("id", pedidoId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      toast.success("Dados de envio salvos");
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message ?? JSON.stringify(err);
      console.error("useSalvarDadosEnvio error:", err);
      toast.error(`Erro ao salvar dados de envio: ${msg}`);
    },
  });
}
