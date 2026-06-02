import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EnviarBlingResponse {
  sucesso: boolean;
  bling_id?: number;
  mensagem?: string;
  erro?: string;
  duracao_ms?: number;
}

export function useEnviarBling() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pedido_id: string): Promise<EnviarBlingResponse> => {
      const { data, error } = await supabase.functions.invoke<EnviarBlingResponse>(
        "enviar-pedido-bling",
        { body: { pedido_id } },
      );
      if (error) {
        // Em não-2xx, a mensagem real da function vem no corpo (error.context),
        // não em error.message (que é o genérico "non-2xx status code").
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.erro) msg = body.erro;
        } catch {
          // corpo não-JSON: mantém a mensagem genérica
        }
        throw new Error(msg);
      }
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao enviar pro Bling");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Pedido enviado pro Bling",
        description: `id Bling: ${data.bling_id}` + (data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""),
      });
      qc.invalidateQueries({ queryKey: ["pedido"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao enviar pro Bling",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
