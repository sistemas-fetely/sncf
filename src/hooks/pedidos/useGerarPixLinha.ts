import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/format-error";

export interface PixLinhaGerado {
  payload: string;
  txid: string;
  token?: string | null;
  valor?: number | null;
  pedido?: string | null;
  beneficiario?: string | null;
  banco?: string | null;
}

interface Args {
  linhaId: string;
  origem: "provisao" | "titulo";
}

/**
 * Gera o QR PIX de UMA linha do plano (provisão pré-NF ou título pós-NF).
 * FAIL-LOUD: a mensagem do Postgres vai direto pro toast — nunca engolir erro.
 */
export function useGerarPixLinha(pedidoId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ linhaId, origem }: Args) => {
      const fn = origem === "provisao" ? "gerar_pix_provisao" : "gerar_pix_titulo";
      const args = origem === "provisao" ? { p_provisao_id: linhaId } : { p_titulo_id: linhaId };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc(fn, args);
      if (error) throw new Error(error.message || formatError(error));
      return data as PixLinhaGerado;
    },
    onSuccess: (data) => {
      toast({
        title: "QR Code PIX gerado",
        description: `Identificador no extrato: ${data?.txid ?? "—"}`,
      });
      qc.invalidateQueries({ queryKey: ["linhas-cobranca-pedido", pedidoId] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", pedidoId] });
    },
    onError: (e: unknown) => {
      toast({
        title: "Não foi possível gerar o PIX",
        description: e instanceof Error ? e.message : formatError(e),
        variant: "destructive",
      });
    },
  });
}
