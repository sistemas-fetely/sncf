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

export interface AmostraFrete {
  p1: number | null; p10: number | null; p30: number | null; p100: number | null;
  frete_10: number | null; frete_50: number | null; prazo: number | null; erro: string | null;
}
export interface LadoComparativo {
  excedente: number | null; adv: number | null; gris: number | null;
  amostra: AmostraFrete | null; cep?: string | null; existe?: boolean;
}
export interface ResultadoImportacaoV2 {
  ok: boolean;
  simulado: boolean;
  tabela_id: string | null;
  vigente_id: string;
  vigente_nome: string;
  vigencia_futura: boolean;
  resumo: {
    tarifas_trocadas: number; tarifas_mantidas: number; ceps_copiados: number;
    prazos_alterados: number; codigos_sem_cep: string[];
  };
  comparativo: {
    tarifa_code: string; uf: string; tipo: string; cep: string | null;
    vigente: LadoComparativo; nova: LadoComparativo;
  }[];
}

export interface ImportarTabelaV2Payload {
  transportadora_id: string;
  nome: string;
  vigencia_inicio: string;
  vigencia_descricao: string | null;
  modo: "parcial" | "completa";
  aplicar_prazo: boolean;
  tarifas: Record<string, unknown>[];
  simular: boolean;
}

/** Simula (nada é gravado) ou publica a versão nova pela fn_importar_tabela_preco_v2. */
export function useImportarTabelaPrecoV2() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: ImportarTabelaV2Payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("fn_importar_tabela_preco_v2", {
        p_transportadora_id: p.transportadora_id,
        p_nome: p.nome,
        p_vigencia_inicio: p.vigencia_inicio,
        p_vigencia_descricao: p.vigencia_descricao,
        p_modo: p.modo,
        p_aplicar_prazo: p.aplicar_prazo,
        p_tarifas: p.tarifas,
        p_simular: p.simular,
      });
      if (error) throw new Error(error.message);
      return data as ResultadoImportacaoV2;
    },
    onSuccess: async (data, vars) => {
      if (data.simulado) return;
      await qc.invalidateQueries({ queryKey: ["logistica", "tabelas-preco", vars.transportadora_id] });
    },
  });
}
