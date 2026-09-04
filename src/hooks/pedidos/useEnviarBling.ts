import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface EnviarBlingResponse {
  sucesso: boolean;
  bling_id?: number;
  remessa_id?: string;
  remessa_codigo?: string;
  mensagem?: string;
  proximo_passo?: string;
  erro?: string;
  duracao_ms?: number;
}

interface EnviarBlingParams {
  pedido_id: string;
  remessa_id?: string;
  /** Override declarado do pré-faturamento (mínimo 15 caracteres, mesmo
   *  padrão do `forcar` em empurrar-pedido-xpm). */
  motivo?: string;
}

export function useEnviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, remessa_id, motivo }: EnviarBlingParams): Promise<EnviarBlingResponse> => {
      const body: Record<string, string> = { pedido_id };
      if (remessa_id) body.remessa_id = remessa_id;
      if (motivo) body.motivo = motivo;

      const { data, error } = await supabase.functions.invoke<EnviarBlingResponse>(
        "enviar-pedido-bling",
        { body },
      );
      if (error) {
        let msg = error.message;
        try {
          const b = await (error as any).context?.json?.();
          if (b?.erro) msg = b.erro;
        } catch { /* mantém mensagem genérica */ }
        throw new Error(msg);
      }
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao enviar pro Bling");
      return data;
    },
    onSuccess: (data, vars) => {
      // `remessa_codigo` vem da edge como PED/NN. Na UI /NN e exclusivo do split:
      // aqui a linha e uma TENTATIVA de envio (decisao-remessa-e-tentativa-envio).
      const seqTentativa = data.remessa_codigo?.match(/\/(\d+)$/)?.[1];
      const desc = seqTentativa
        ? `Tentativa ${Number(seqTentativa)} · id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`
        : `id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`;

      toast({
        title: "Enviado pro Bling",
        description: data.proximo_passo ? `${desc} · ${data.proximo_passo}` : desc,
      });

      invalidarPedido(qc, vars.pedido_id);
    },
    onError: (e: Error, vars) => {
      toast({ title: "Erro ao enviar pro Bling", description: e.message, variant: "destructive" });
      // A edge cria a remessa antes do POST: mesmo com falha, o estado pode ter mudado.
      invalidarPedido(qc, vars.pedido_id);
    },
  });
}
