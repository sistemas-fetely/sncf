import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TabelaPrecoVersao {
  id: string;
  nome: string;
  modal: string | null;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  vigencia_descricao: string | null;
  ativo: boolean;
  criado_em: string;
  total_zonas: number;
}

export function useTabelasPreco(transportadoraId: string) {
  return useQuery({
    queryKey: ["logistica", "tabelas-preco", transportadoraId],
    queryFn: async (): Promise<TabelaPrecoVersao[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("transp_tabelas")
        .select(
          "id, nome, modal, vigencia_inicio, vigencia_fim, vigencia_descricao, ativo, criado_em, transp_tabela_tarifas(count)"
        )
        .eq("transportadora_id", transportadoraId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        modal: r.modal,
        vigencia_inicio: r.vigencia_inicio,
        vigencia_fim: r.vigencia_fim,
        vigencia_descricao: r.vigencia_descricao,
        ativo: r.ativo,
        criado_em: r.criado_em,
        total_zonas: r.transp_tabela_tarifas?.[0]?.count ?? 0,
      }));
    },
    enabled: !!transportadoraId,
    staleTime: 60 * 1000,
  });
}

export interface ImportarTabelaPayload {
  transportadora_id: string;
  nome: string;
  modal: string;
  vigencia_inicio: string;
  vigencia_descricao: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taxas: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  zonas: Record<string, any>[];
}

export function useImportarTabelaPreco() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ImportarTabelaPayload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_importar_tabela_preco", {
        p_transportadora_id: payload.transportadora_id,
        p_nome: payload.nome,
        p_modal: payload.modal,
        p_vigencia_inicio: payload.vigencia_inicio,
        p_vigencia_descricao: payload.vigencia_descricao,
        p_taxas: payload.taxas,
        p_zonas: payload.zonas,
      });
      if (error) throw error;
      return data as { ok: boolean; tabela_id: string; zonas_inseridas: number };
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["logistica", "tabelas-preco", vars.transportadora_id] });
    },
  });
}
