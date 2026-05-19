import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { RegistrarCompraInput } from "@/lib/compras/types";

export interface RegistrarCompraResult {
  compra_id: string;
  pedido_status: string;
  pedido_finalizado: boolean;
  cprs_geradas: number;
  parcela_grupo_id: string;
  valor_total: number;
  aviso_divergencia: string | null;
}

export function useRegistrarCompraPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarCompraInput) => {
      const { data, error } = await supabase.rpc("registrar_compra_pedido", {
        p_pedido_id: input.pedido_id,
        p_parceiro_id: input.parceiro_id,
        p_valor_total: input.valor_total,
        p_data_compra: input.data_compra,
        p_meio_pagamento_id: input.meio_pagamento_id,
        p_parcelas_count: input.parcelas_count,
        p_primeira_parcela_data: input.primeira_parcela_data,
        p_intervalo_dias: input.intervalo_dias,
        p_periodicidade: input.periodicidade,
        p_conta_id: input.plano_contas_id ?? null,
        p_observacao: input.observacao ?? null,
        p_itens: input.itens as unknown as never,
      });
      if (error) throw error;
      return data as unknown as RegistrarCompraResult;
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["compras", "a-comprar"] });
      qc.invalidateQueries({ queryKey: ["compras", "meus-pedidos"] });
      toast.success(`Compra registrada. ${res.cprs_geradas} parcela(s) criadas em Contas a Pagar.`);
      if (res.pedido_finalizado) toast.success("Pedido finalizado e movido para Comprado.");
      if (res.aviso_divergencia) toast.warning(res.aviso_divergencia);
    },
    onError: (e: Error) => toast.error(e.message || "Erro ao registrar compra"),
  });
}
