import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { rawMessage } from "@/lib/format-error";

export interface LinhaPlanoPayload {
  numero_parcela: number;
  tipo_pagamento: string;
  valor: number;
  data_prevista: string;
  eh_portao: boolean;
  eh_entrada: boolean;
  condicao_pagamento?: string | null;
  link_pagamento?: string | null;
}

export interface MontarPlanoResult {
  ok: boolean;
  linhas?: Array<{
    provisao_id: string;
    portao_id: string | null;
    numero_parcela: number;
    tipo_pagamento: string;
    valor: number;
    data: string;
    eh_portao: boolean;
  }>;
  linhas_criadas?: number;
  portoes?: number;
  soma_portao?: number;
  haver_aplicado?: number;
  proximo_estagio?: string;
  portao_obrigatorio?: boolean;
  portao_minimo_pct?: number;
}

interface Args {
  pedidoId: string;
  linhas: LinhaPlanoPayload[];
  motivo?: string;
}

/**
 * COMPOSIÇÃO DE PAGAMENTO: uma única porta para montar o plano de recebimento.
 * O portão é atributo de linha (`eh_portao`), não "a primeira parcela".
 * O banco valida soma, exposição a prazo e cobertura mínima de portão —
 * a mensagem dele vai CRUA para o toast.
 */
export function useMontarPlanoPagamento() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pedidoId, linhas, motivo }: Args): Promise<MontarPlanoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("montar_plano_pagamento", {
        p_pedido_id: pedidoId,
        p_linhas: linhas,
        p_motivo: motivo ?? null,
      });
      if (error) throw error;
      return (data ?? { ok: true }) as MontarPlanoResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["cobranca-fila"] });
      qc.invalidateQueries({ queryKey: ["cobranca-proposta"] });
      qc.invalidateQueries({ queryKey: ["cobranca-pedido-minimo"] });
      qc.invalidateQueries({ queryKey: ["pedido-detalhe"] });
      qc.invalidateQueries({ queryKey: ["provisoes-pedido"] });
      qc.invalidateQueries({ queryKey: ["pedido-portao-provisorio"] });
      qc.invalidateQueries({ queryKey: ["estado-instrumento-portao"] });
      qc.invalidateQueries({ queryKey: ["pedidos-fila"] });
      qc.invalidateQueries({ queryKey: ["pedidos-pipeline"] });
      const portoes = res.portoes ?? 0;

      toast({
        title: "Plano de pagamento montado",
        description:
          `${res.linhas_criadas ?? 0} linha(s) criada(s)` +
          (portoes > 0 ? ` · ${portoes} de portão` : "") +
          (res.haver_aplicado && res.haver_aplicado > 0
            ? ` · haver aplicado ${res.haver_aplicado}`
            : ""),
      });
    },
    onError: (e: unknown) => {
      console.error("[montar_plano_pagamento]", e);
      toast({
        title: "Erro ao montar plano de pagamento",
        description: rawMessage(e),
        variant: "destructive",
      });
    },
  });
}
