import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface RetornoRow {
  sku: string;
  qtd: number;
  condicao: string | null;
}

export interface RegistrarRetornoInput {
  pedido_id: string;
  rows: RetornoRow[];
  doc_numero: string | null;
  obs: string | null;
  centro?: string;
  data?: string | null;
}

export interface RetornoDetalhe {
  sku: string;
  qtd: number;
  condicao?: string | null;
  [k: string]: unknown;
}

export interface RegistrarRetornoResult {
  pedido?: string;
  itens?: number;
  unidades?: number;
  detalhe?: RetornoDetalhe[];
  aviso?: string | null;
  [k: string]: unknown;
}

export function useRegistrarRetornoDevolucao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegistrarRetornoInput): Promise<RegistrarRetornoResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("registrar_retorno_devolucao", {
        p_pedido_id: input.pedido_id,
        p_rows: input.rows,
        p_doc_numero: input.doc_numero,
        p_obs: input.obs,
        p_centro: input.centro ?? "XPM-SC",
        p_data: input.data ?? new Date().toISOString(),
      });
      if (error) throw error;
      return (data ?? {}) as RegistrarRetornoResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["devolucao-retorno-pendente"] });
      qc.invalidateQueries({ queryKey: ["vw_estoque_rede"] });
      qc.invalidateQueries({ queryKey: ["estoque-centro"] });
      qc.invalidateQueries({ queryKey: ["estoque-posicao"] });
    },
  });
}
