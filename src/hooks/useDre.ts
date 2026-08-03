import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DreLinhaMes {
  mes: string;
  codigo: string;
  label: string;
  nivel: number;
  pai_codigo: string | null;
  ordem: number;
  papel: "analitica" | "subtotal" | "bloco";
  sinal: number;
  fonte: string | null;
  exibe_pct_receita: boolean | null;
  nota: string | null;
  valor: number | null;
  receita_liquida_mes: number | null;
  pct_receita_liquida: number | null;
}

export interface DreIntegridadeRow {
  mes: string;
  ord: number;
  indicador: string;
  label: string;
  severidade: "verde" | "laranja" | "vermelho";
  qtd: number | null;
  valor: number | null;
}

export interface DreRefreshEstado {
  refreshed_em: string | null;
  duracao_ms: number | null;
  linhas: number | null;
  erro: string | null;
}

export interface DreDespesaRow {
  id: string;
  data_competencia: string | null;
  fornecedor_nome: string | null;
  descricao: string | null;
  valor: number | null;
}

/** Meses distintos disponíveis na DRE (mais recente primeiro). */
export function useDreMeses() {
  return useQuery({
    queryKey: ["dre", "meses"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dre_meses")
        .select("mes")
        .order("mes", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as { mes: string | null }[])
        .map((r) => r.mes?.slice(0, 10))
        .filter((m): m is string => !!m);
    },
  });
}

/** Linhas da DRE apenas dos meses pedidos (filtro no servidor). */
export function useDreMensal(meses: string[]) {
  return useQuery({
    enabled: meses.length > 0,
    queryKey: ["dre", "vw_dre_mensal", ...meses],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dre_mensal")
        .select("*")
        .in("mes", meses)
        .order("mes", { ascending: false })
        .order("ordem", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DreLinhaMes[];
    },
  });
}

export function useDreIntegridade(mes: string | null) {
  return useQuery({
    enabled: !!mes,
    queryKey: ["dre", "vw_dre_integridade", mes],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vw_dre_integridade")
        .select("*")
        .eq("mes", mes)
        .order("ord", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DreIntegridadeRow[];
    },
  });
}


export function useDreRefreshEstado() {
  return useQuery({
    queryKey: ["dre", "dre_refresh_estado"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("dre_refresh_estado")
        .select("refreshed_em, duracao_ms, linhas, erro")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as DreRefreshEstado | null;
    },
  });
}

/** Drill-down: despesas do mês cuja conta do plano aponta para a linha da DRE. */
export function useDreDespesas(codigo: string | null, mes: string | null) {
  return useQuery({
    enabled: !!codigo && !!mes,
    queryKey: ["dre", "despesas", codigo, mes],
    queryFn: async () => {
      const ini = mes!;
      const d = new Date(`${ini}T00:00:00`);
      const fim = `${new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)}`;

      const { data, error } = await (supabase as any)
        .from("despesas")
        .select(
          "id, data_competencia, fornecedor_nome, descricao, valor, plano_contas!inner(id, dre_linha!inner(codigo))",
        )
        .eq("plano_contas.dre_linha.codigo", codigo)
        .gte("data_competencia", ini)
        .lt("data_competencia", fim)
        .order("valor", { ascending: false });
      if (error) throw error;
      return (data ?? []) as DreDespesaRow[];
    },
  });
}
