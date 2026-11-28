// Repositório de Mídia · leitura da gestão (mapa-repositorio-midia-v1, 28/11/2026). Só leitura.
import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { MidiaProduto } from "@/lib/midia/gestao";

const sb = supabase as unknown as SupabaseClient;
export const KEY_MIDIA = ["midia-gestao"] as const;

export type MidiaResumo = { produtos_ativos: number; com_foto: number; so_cor_colecao: number; sem_foto: number; com_video: number; arquivos_foto: number; arquivos_video: number; falhas: number; pendentes: number; variantes_sem_vinculo: number; mb_bucket: number };
export type MidiaArquivo = { id: string; tipo: string; principal: boolean | null; vinculo: string | null; ordem: number | null; url_800: string | null; url_fonte: string | null; url_original: string | null; video_url: string | null; video_status: string | null };
export type VarianteSemVinculo = { shopify_id: string; title: string | null; status: string | null; variant_id: string; sku: string | null; n_imagens: number | null };

export function useMidiaResumo() {
  return useQuery({ queryKey: [...KEY_MIDIA, "resumo"], queryFn: async () => {
    const { data, error } = await sb.from("vw_midia_resumo").select("*").maybeSingle();
    if (error) throw error;
    return data as MidiaResumo | null;
  } });
}

export function useMidiaProdutos() {
  return useQuery({ queryKey: [...KEY_MIDIA, "produtos"], queryFn: async () => {
    const todos: MidiaProduto[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("vw_midia_produto_gestao").select("*").order("cod_cadastro").range(de, de + 999);
      if (error) throw error;
      todos.push(...((data ?? []) as MidiaProduto[]));
      if (!data || data.length < 1000) break;
    }
    return todos;
  } });
}

export function useMidiaGaleria(cod: string | null) {
  return useQuery({ queryKey: [...KEY_MIDIA, "galeria", cod], enabled: !!cod, queryFn: async () => {
    const { data, error } = await sb.from("produto_midia")
      .select("id,tipo,principal,vinculo,ordem,url_800,url_fonte,url_original,video_url,video_status")
      .eq("cod_cadastro", cod!).eq("ativo", true);
    if (error) throw error;
    const l = (data ?? []) as MidiaArquivo[];
    // principal desc, tipo, (vinculo <> 'variante'), ordem
    return l.sort((a, b) => Number(!!b.principal) - Number(!!a.principal) || a.tipo.localeCompare(b.tipo)
      || Number(a.vinculo !== "variante") - Number(b.vinculo !== "variante") || (a.ordem ?? 0) - (b.ordem ?? 0));
  } });
}

export function useVariantesSemVinculo(ativo: boolean) {
  return useQuery({ queryKey: [...KEY_MIDIA, "sem-vinculo"], enabled: ativo, queryFn: async () => {
    const { data, error } = await sb.from("vw_midia_sem_vinculo").select("*").order("title").limit(1000);
    if (error) throw error;
    return (data ?? []) as VarianteSemVinculo[];
  } });
}

/** Contagem leve das variantes sem vínculo (o resumo agregado pode estourar o tempo). */
export function useContagemSemVinculo() {
  return useQuery({ queryKey: [...KEY_MIDIA, "sem-vinculo-n"], queryFn: async () => {
    const { count, error } = await sb.from("vw_midia_sem_vinculo").select("variant_id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  } });
}
