import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/format-error";

export interface PixPortaoGerado {
  payload: string;
  txid: string;
  valor: number | null;
  pedido: string | null;
  beneficiario: string | null;
  banco: string | null;
  /** token estável da página pública /pagar/:token — regerar o QR não muda o token */
  token?: string | null;
}


interface Args {
  portao_id: string;
  /** usado só para invalidar as queries do pedido */
  pedido_id?: string | null;
}

export function useGerarPixPortao() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ portao_id }: Args) => {
      const { data, error } = await (supabase as any).rpc("gerar_pix_portao", {
        p_portao_id: portao_id,
      });
      // FAIL-LOUD: a mensagem do Postgres explica exatamente o que está errado.
      if (error) throw new Error(error.message || formatError(error));
      return data as PixPortaoGerado;
    },
    onSuccess: (data, vars) => {
      toast({
        title: "QR Code PIX gerado",
        description: `Identificador no extrato: ${data?.txid ?? "—"}`,
      });
      for (const key of [
        "portao-links",
        "pedido-portao-provisorio",
        "pedido-detalhe",
        "pedido-titulos",
        "link-pagamento",
      ]) {
        qc.invalidateQueries({ queryKey: vars.pedido_id ? [key, vars.pedido_id] : [key] });
      }
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
