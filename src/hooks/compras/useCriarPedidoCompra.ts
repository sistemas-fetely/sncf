import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { NovoItem } from "@/lib/compras/types";

export interface CriarPedidoInput {
  centro_custo_id?: string | null;
  linha_investimento_id?: string | null;
  parceiro_preferencial_id?: string | null;
  descricao_geral?: string | null;
  justificativa?: string | null;
  itens: NovoItem[];
  data_necessidade?: string | null;
  urgente?: boolean;
  urgencia_justificativa?: string | null;
  solicitante_externo?: string | null;
}

export function useCriarPedidoCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CriarPedidoInput) => {
      const itensPayload = input.itens.map((it) => ({
        descricao: it.descricao,
        quantidade: it.quantidade,
        valor_estimado_unitario: it.valor_estimado_unitario,
        urls: it.urls,
        especificacao_tecnica: it.especificacao_tecnica,
        ...(it.unidade_id ? { unidade_id: it.unidade_id } : {}),
        ...(it.unidade_sigla ? { unidade_sigla: it.unidade_sigla } : {}),
      }));
      const { data, error } = await supabase.rpc("criar_pedido_compra", {
        p_centro_custo_id: input.centro_custo_id ?? null,
        p_linha_investimento_id: input.linha_investimento_id ?? null,
        p_parceiro_preferencial_id: input.parceiro_preferencial_id ?? null,
        p_descricao_geral: input.descricao_geral ?? null,
        p_justificativa: input.justificativa ?? null,
        p_itens: itensPayload as unknown as never,
        p_data_necessidade: input.data_necessidade ?? undefined,
        p_urgente: input.urgente ?? false,
        p_urgencia_justificativa: input.urgencia_justificativa ?? undefined,
        p_solicitante_externo: input.solicitante_externo ?? null,
      });
      if (error) throw error;
      return data as { pedido_id: string; status: string; itens_criados: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao criar pedido"),
  });
}
