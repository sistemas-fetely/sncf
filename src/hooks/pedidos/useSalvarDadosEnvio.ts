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

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v ?? 0);

export function useSalvarDadosEnvio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, transportadoraId, pesoBrutoTotal, freteTipo, valorFrete }: DadosEnvio) => {
      const { data, error } = await (supabase as any).rpc("atualizar_frete_pedido", {
        p_pedido_id:         pedidoId,
        p_transportadora_id: transportadoraId || null,
        p_peso_bruto_total:  pesoBrutoTotal,
        p_frete_tipo:        freteTipo || null,
        p_valor_frete:       valorFrete,
      });
      if (error) throw error;
      return data as { ok: boolean; novo_liquido: number; valor_frete: number };
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      toast.success(`Dados de envio salvos — novo total: R$ ${fmtBRL(data?.novo_liquido ?? 0)}`);
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
