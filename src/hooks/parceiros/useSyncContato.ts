import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SyncContatoResponse {
  sucesso: boolean;
  bling_id?: string;
  acao?: string;
  ignorado?: boolean;
  motivo?: string;
  mensagem?: string;
  erro?: string;
  ja_existia?: boolean;
}

export function useSyncContato() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (parceiro_id: string): Promise<SyncContatoResponse> => {
      const { data, error } = await supabase.functions.invoke<SyncContatoResponse>(
        "sync-contato-bling",
        { body: { parceiro_id, origem: "manual" } },
      );
      if (error) {
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.erro) msg = body.erro;
        } catch {
          // corpo nao-JSON: mantem a mensagem generica
        }
        throw new Error(msg);
      }
      if (!data?.sucesso && !data?.ignorado) {
        throw new Error(data?.erro || "Falha ao sincronizar contato");
      }
      return data;
    },
    onSuccess: (data, parceiro_id) => {
      if (data.ignorado) {
        toast({
          title: "Sync ignorado",
          description: data.mensagem || data.motivo || "Cadastro nao elegivel",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Contato sincronizado no Bling",
          description: `id Bling: ${data.bling_id}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["parceiro-bling-check", parceiro_id] });
      qc.invalidateQueries({ queryKey: ["parceiro"] });
      qc.invalidateQueries({ queryKey: ["parceiros"] });
    },
    onError: (e: Error) => {
      toast({
        title: "Erro ao sincronizar contato",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
