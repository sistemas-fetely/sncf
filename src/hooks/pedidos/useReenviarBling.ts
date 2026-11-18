import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface ReenviarParams {
  pedido_id: string;
  motivo: string;
}

interface ReenviarResponse {
  sucesso: boolean;
  bling_id?: number;
  remessa_id?: string;
  remessa_codigo?: string;
  duracao_ms?: number;
  erro?: string;
}

export function useReenviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, motivo }: ReenviarParams): Promise<ReenviarResponse> => {
      const { data, error } = await supabase.functions.invoke<ReenviarResponse>(
        "enviar-pedido-bling",
        { body: { acao: "reenviar", pedido_id, motivo } },
      );

      if (error) {
        let corpo: { erro?: string } | null = null;
        try { corpo = await (error as { context?: Response }).context?.json?.(); } catch { /* mantém genérico */ }
        throw new Error(corpo?.erro ?? error.message);
      }
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao reenviar pro Bling");
      return data;
    },
    onSuccess: async (data, vars) => {
      toast({
        title: "Reenviado pro Bling",
        description: `Novo id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`,
      });
      await invalidarPedido(qc, vars.pedido_id);
    },
    onError: async (e: Error, vars) => {
      toast({ title: "Erro ao reenviar pro Bling", description: e.message, variant: "destructive" });
      // A preparação pode ter acontecido antes da falha do POST: revalida sempre.
      await invalidarPedido(qc, vars.pedido_id);
    },
  });
}
