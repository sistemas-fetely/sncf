import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface EmpurrarXpmResponse {
  sucesso: boolean;
  codigo_expedicao?: string;
  ambiente?: string;
  bloqueios?: string[];
  erro?: string;
  duracao_ms?: number;
}

interface EmpurrarXpmParams {
  pedido_id: string;
  remessa_id: string;
}

export function useEmpurrarXpm() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ remessa_id }: EmpurrarXpmParams): Promise<EmpurrarXpmResponse> => {
      const { data, error } = await supabase.functions.invoke<EmpurrarXpmResponse>(
        "empurrar-pedido-xpm",
        { body: { remessa_id } },
      );
      if (error) {
        // A edge devolve 422 com a lista de bloqueios no corpo; sem isso o
        // operador só veria "erro genérico" e não saberia o que corrigir.
        let msg = error.message;
        try {
          const b = await (error as any).context?.json?.();
          if (Array.isArray(b?.bloqueios) && b.bloqueios.length > 0) {
            msg = b.bloqueios.join(" · ");
          } else if (b?.erro) {
            msg = b.erro;
          }
        } catch { /* mantém mensagem genérica */ }
        throw new Error(msg);
      }
      if (!data?.sucesso) throw new Error(data?.erro || "Falha ao empurrar pra XPM");
      return data;
    },
    onSuccess: (data, vars) => {
      const amb = data.ambiente === "producao" ? "" : ` · ${data.ambiente}`;
      toast({
        title: "Empurrado pra XPM",
        description: `Expedição ${data.codigo_expedicao}${amb}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`,
      });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["remessas", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
    },
    onError: (e: Error, vars) => {
      toast({ title: "Erro ao empurrar pra XPM", description: e.message, variant: "destructive" });
      // O erro fica gravado em pedido_remessa.xpm_envio_erro: recarrega pra exibir.
      qc.invalidateQueries({ queryKey: ["remessas", vars.pedido_id] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe", vars.pedido_id] });
    },
  });
}
