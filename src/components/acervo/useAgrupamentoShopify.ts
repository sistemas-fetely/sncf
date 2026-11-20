import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CampoVariacao, ColecaoAgrupamento, PreviaAgrupamento } from "./agrupamentoShopify";

export const agrupamentoKey = ["shopify-agrupamentos"];
export interface HistoricoAgrupamento {
  id: string; titulo: string; eixos: string[]; skus: number; status: string;
  vigente_de: string; vigente_ate: string | null; id_externo?: string | null;
}

export interface FiltrosAgrupamento { busca: string; colecao: string; grupo: string; tipo: string; situacao: string }
export interface OpcoesAgrupamento { colecoes: string[]; grupos: string[]; tipos: { rotulo: string; grupo: string }[]; situacoes: { slug: string; nome: string }[] }
export function useFiltrosAgrupamento() {
  return useQuery({ queryKey: [...agrupamentoKey, "filtros"], queryFn: async () => {
    const { data, error } = await (supabase.rpc as any)("fn_agrupamento_filtros", { p_sistema: "Shopify" });
    if (error) throw error;
    if (!data) throw new Error("Resposta vazia ao carregar filtros.");
    return data as OpcoesAgrupamento;
  } });
}
export function useColecoesAgrupamento(filtros: FiltrosAgrupamento) {
  return useQuery({ queryKey: [...agrupamentoKey, "colecoes", filtros], queryFn: async () => {
    const { data, error } = await (supabase.rpc as any)("fn_agrupamento_colecoes", {
      p_sistema: "Shopify", p_colecao: filtros.colecao || null, p_grupo: filtros.grupo || null,
      p_tipo: filtros.tipo || null, p_status: filtros.situacao || null, p_busca: filtros.busca || null,
    });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Resposta vazia ao carregar coleções.");
    return data as ColecaoAgrupamento[];
  } });
}

export function useAgrupamentosVigentes(ids: string[]) {
  return useQuery({ queryKey: [...agrupamentoKey, "vigentes", ids], enabled: ids.length > 0, queryFn: async () => {
    const { data, error } = await supabase.from("vw_produto_agrupamento_lista" as any)
      .select("id,titulo,eixos,skus,status,vigente_de,vigente_ate,id_externo").in("id", ids);
    if (error) throw error;
    return (data ?? []) as unknown as HistoricoAgrupamento[];
  } });
}

export function useCamposVariacao() {
  return useQuery({ queryKey: [...agrupamentoKey, "campos"], queryFn: async () => {
    const { data, error } = await supabase.from("produto_variacao_campo_dim" as any)
      .select("slug,nome,ordem").eq("ativo", true).order("ordem");
    if (error) throw error;
    return (data ?? []) as unknown as CampoVariacao[];
  } });
}

export function usePreviaAgrupamento(colecao: string, tipo: string, eixos: string[] | null) {
  return useQuery({ queryKey: [...agrupamentoKey, "previa", colecao, tipo, eixos], queryFn: async () => {
    const { data, error } = await (supabase.rpc as any)("fn_agrupamento_previa", {
      p_sistema: "Shopify", p_colecao: colecao, p_tipo: tipo, p_eixos: eixos,
    });
    if (error) throw error;
    if (!data || !Array.isArray(data.eixos) || !Array.isArray(data.pais)) throw new Error("Resposta vazia ao gerar prévia.");
    return data as PreviaAgrupamento;
  } });
}

export function useHistoricoAgrupamento(colecao: string) {
  return useQuery({ queryKey: [...agrupamentoKey, "historico", colecao], queryFn: async () => {
    const { data, error } = await supabase.from("vw_produto_agrupamento_lista" as any)
      .select("id,titulo,eixos,skus,status,vigente_de,vigente_ate").eq("sistema", "Shopify")
      .eq("colecao", colecao).order("vigente_de", { ascending: false }).limit(100);
    if (error) throw error;
    return (data ?? []) as unknown as HistoricoAgrupamento[];
  } });
}