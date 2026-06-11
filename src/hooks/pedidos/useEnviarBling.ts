import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EnviarBlingResponse {
  sucesso: boolean;
  bling_id?: number;
  remessa_id?: string;
  remessa_codigo?: string;
  mensagem?: string;
  aviso_transicao?: string;
  erro?: string;
  duracao_ms?: number;
}

interface EnviarBlingParams {
  pedido_id: string;
  remessa_id?: string;
}

export function useEnviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, remessa_id }: EnviarBlingParams): Promise<EnviarBlingResponse> => {
      const body: Record<string, string> = { pedido_id };
      if (remessa_id) body.remessa_id = remessa_id;

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
      const desc = data.remessa_codigo
        ? `Remessa ${data.remessa_codigo} · id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`
        : `id Bling: ${data.bling_id}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`;

      toast({ title: "Enviado pro Bling", description: desc });

      if (data.aviso_transicao) {
        toast({
          title: "Atenção — estágio não avançou",
          description: data.aviso_transicao,
          variant: "destructive",
        });
      }

      qc.invalidateQueries({ queryKey: ["pedido"] });
      qc.invalidateQueries({ queryKey: ["remessas", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar pro Bling", description: e.message, variant: "destructive" });
    },
  });
}
