import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invalidarPedido } from "@/lib/pedidos/invalidarPedido";

interface EmpurrarXpmResponse {
  sucesso: boolean;
  codigo_expedicao?: string;
  ambiente?: string;
  bloqueios?: string[];
  /** FOTO-NAO-BARRA: saldo insuficiente vira aviso, nunca bloqueio. */
  avisos?: string[];
  aviso_transicao?: string;
  erro?: string;
  duracao_ms?: number;
}

// A expedição é do PEDIDO, não da remessa. `pedido_remessa` é histórico de
// tentativas de envio ao Bling, e /NN pertence só ao split — derivar código de
// expedição dali colidiria com id_externo de pedidos-filho reais.
// Ver sncf_documentacao `decisao-remessa-e-tentativa-envio`.
interface EmpurrarXpmParams {
  pedido_id: string;
  /**
   * OVERRIDE-TEM-NOME: lista de códigos de `xpm_override_dim` a furar
   * (`estoque`, `expedicao_existente`, `lastro`). Cada um tem permissão própria.
   */
  forcar?: string[];
  /** Obrigatório quando há override (mín. 15 caracteres). */
  motivo?: string;
}

export function useEmpurrarXpm() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedido_id, forcar, motivo }: EmpurrarXpmParams): Promise<EmpurrarXpmResponse> => {
      const overrides = forcar ?? [];
      const { data, error } = await supabase.functions.invoke<EmpurrarXpmResponse>(
        "empurrar-pedido-xpm",
        {
          body: {
            pedido_id,
            ...(overrides.length > 0 ? { forcar: overrides } : {}),
            ...(motivo ? { motivo } : {}),
          },
        },
      );
      if (error) {
        // A edge devolve 422 com a lista de bloqueios no corpo; sem isso o
        // operador só veria "erro genérico" e não saberia o que corrigir.
        let msg = error.message;
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const avisos = data.avisos ?? [];
      if (avisos.length > 0) {
        toast({
          title: "Empurrado pra XPM — com aviso de saldo",
          description: `Expedição ${data.codigo_expedicao}${amb} · ${avisos[0]}`,
        });
      } else {
        toast({
          title: vars.forcar ? "Empurrado pra XPM (forçado)" : "Empurrado pra XPM",
          description: `Expedição ${data.codigo_expedicao}${amb}${data.duracao_ms ? ` · ${data.duracao_ms}ms` : ""}`,
        });
      }
      if (data.aviso_transicao) {
        toast({
          title: "Atenção — estágio não avançou",
          description: data.aviso_transicao,
          variant: "destructive",
        });
      }
      invalidarPedido(qc, vars.pedido_id);
    },
    onError: (e: Error, vars) => {
      toast({ title: "Erro ao empurrar pra XPM", description: e.message, variant: "destructive" });
      // O erro fica gravado em pedidos.xpm_envio_erro: recarrega pra exibir.
      invalidarPedido(qc, vars.pedido_id);
    },
  });
}
