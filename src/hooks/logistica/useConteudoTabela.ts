import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TabelaAtiva {
  id: string;
  transportadora_id: string;
  nome: string;
  modal: string | null;
  ativo: boolean;
  vigencia_inicio: string | null;
  vigencia_fim: string | null;
  vigencia_descricao: string | null;
  gris_pct: number | null;
  gris_base: string | null;
  gris_minimo: number | null;
  adm_pct: number | null;
  tx_coleta: number | null;
  pedagio_por_100kg: number | null;
  suframa: number | null;
  tas: number | null;
}

export function useTabelaAtiva(transportadoraId: string) {
  return useQuery({
    queryKey: ["logistica", "conteudo-tabela", "ativa", transportadoraId],
    queryFn: async (): Promise<TabelaAtiva | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("transp_tabelas")
        .select("*")
        .eq("transportadora_id", transportadoraId)
        .eq("ativo", true)
        .maybeSingle();
      if (error) throw error;
      return (data as TabelaAtiva) ?? null;
    },
    enabled: !!transportadoraId,
    staleTime: 60 * 1000,
  });
}

export interface ZonaTarifa {
  id: string;
  tabela_id: string;
  tarifa_code: string;
  uf: string;
  modelo_peso: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pesos: Record<string, any> | null;
  kg_adicional: number | null;
  peso_minimo: number | null;
  fv_pct: number | null;
  txa: number | null;
}

export function useZonasTabela(tabelaId: string | null | undefined) {
  return useQuery({
    queryKey: ["logistica", "conteudo-tabela", "zonas", tabelaId],
    queryFn: async (): Promise<ZonaTarifa[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("transp_tabela_tarifas")
        .select("*")
        .eq("tabela_id", tabelaId)
        .order("uf", { ascending: true })
        .order("tarifa_code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ZonaTarifa[];
    },
    enabled: !!tabelaId,
    staleTime: 60 * 1000,
  });
}

export interface CepAtendimento {
  id: string;
  tabela_id: string;
  tarifa_code: string;
  uf: string;
  cidade: string | null;
  cep_inicial: number;
  cep_final: number;
  zona: string | null;
  prazo: number | null;
  tda_risco: number | null;
}

export interface CepsFiltros {
  uf?: string | null;
  tarifaCode?: string | null;
  busca?: string | null;
  page: number;
  pageSize?: number;
}

export function useCepsTabela(tabelaId: string | null | undefined, filtros: CepsFiltros) {
  const pageSize = filtros.pageSize ?? 50;
  const page = filtros.page ?? 0;
  return useQuery({
    queryKey: [
      "logistica",
      "conteudo-tabela",
      "ceps",
      tabelaId,
      filtros.uf ?? null,
      filtros.tarifaCode ?? null,
      filtros.busca ?? null,
      page,
      pageSize,
    ],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("transp_tabela_atendimento")
        .select("*", { count: "exact" })
        .eq("tabela_id", tabelaId);
      if (filtros.uf) q = q.eq("uf", filtros.uf);
      if (filtros.tarifaCode) q = q.eq("tarifa_code", filtros.tarifaCode);
      if (filtros.busca) {
        const digits = filtros.busca.replace(/\D/g, "");
        if (digits) {
          const n = parseInt(digits, 10);
          if (!isNaN(n)) {
            q = q.lte("cep_inicial", n).gte("cep_final", n);
          }
        }
      }
      const from = page * pageSize;
      const to = from + pageSize - 1;
      q = q.order("uf", { ascending: true }).order("tarifa_code", { ascending: true }).order("cep_inicial", { ascending: true }).range(from, to);
      const { data, error, count } = await q;
      if (error) throw error;
      return {
        rows: (data ?? []) as CepAtendimento[],
        total: count ?? 0,
        page,
        pageSize,
      };
    },
    enabled: !!tabelaId,
    staleTime: 30 * 1000,
  });
}
