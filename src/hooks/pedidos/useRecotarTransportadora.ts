import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatError } from "@/lib/format-error";
import { toast } from "sonner";

interface RecotarInput {
  pedidoId: string;
  forcar?: boolean;
}

interface RecotarResult {
  ok: boolean;
  transportadora_id?: string | null;
  transportadora_nome?: string | null;
  valor_estimado?: number | null;
  prazo_dias?: number | null;
  motivo?: string | null;
}

export function useRecotarTransportadora() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pedidoId, forcar = false }: RecotarInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_aplicar_sugestao_transportadora", {
        p_pedido_id: pedidoId,
        p_forcar: forcar,
      });
      if (error) throw error;
      return (data ?? { ok: false, motivo: "Resposta vazia do servidor" }) as RecotarResult;
    },
    onSuccess: (data, vars) => {
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedidoId] });
      if (data.ok) {
        toast.success(
          data.transportadora_nome
            ? `Sugestão aplicada: ${data.transportadora_nome}`
            : "Sugestão de transportadora aplicada"
        );
      } else {
        toast.error(data.motivo ?? "Não foi possível aplicar a sugestão de transportadora");
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error
        ? err.message
        : (err as any)?.message ?? JSON.stringify(err);
      console.error("useRecotarTransportadora error:", err);
      toast.error(`Erro ao recotar transportadora: ${msg}`);
    },
  });
}
