import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { KitLinha } from "@/lib/acervo/kitsProduto";

// Views/tabelas de kit ainda fora do types.ts gerado.
const db = supabase as any;
const CHAVE = ["produto-kits"] as const;

export type KitComponente = {
  kit_sku: string; componente_sku: string; cod_cadastro: string | null; nome: string | null;
  quantidade: number; preco_ref: number | null; componente_ativo: boolean; disponivel: number | null;
};
export type KitEvento = { id: string; kit_sku: string; tipo: string; detalhe: any; por_nome: string | null; em: string };
export type ProdutoOpcao = { sku: string; cod_cadastro: string | null; nome: string; preco: number | null };

export function useKits() {
  return useQuery({
    queryKey: [...CHAVE, "lista"],
    queryFn: async () => {
      const { data, error } = await db.from("vw_produto_kit_lista").select("*").order("sku");
      if (error) throw error;
      return (data ?? []) as KitLinha[];
    },
  });
}

export function useKitComponentes(sku: string | null) {
  return useQuery({
    queryKey: [...CHAVE, "componentes", sku],
    enabled: !!sku,
    queryFn: async () => {
      const { data, error } = await db.from("vw_produto_kit_componente").select("*").eq("kit_sku", sku);
      if (error) throw error;
      return (data ?? []) as KitComponente[];
    },
  });
}

export function useKitEventos(sku: string | null) {
  return useQuery({
    queryKey: [...CHAVE, "eventos", sku],
    enabled: !!sku,
    queryFn: async () => {
      const [ev, dim] = await Promise.all([
        db.from("produto_kit_evento").select("id, kit_sku, tipo, detalhe, por_nome, em").eq("kit_sku", sku).order("em", { ascending: false }),
        db.from("produto_kit_evento_tipo_dim").select("codigo, rotulo"),
      ]);
      if (ev.error) throw ev.error;
      if (dim.error) throw dim.error;
      const rotulos = new Map<string, string>((dim.data ?? []).map((d: any) => [d.codigo, d.rotulo]));
      return { eventos: (ev.data ?? []) as KitEvento[], rotulos };
    },
  });
}

export function useBuscaProdutoAtivo(termo: string) {
  const [debounced, setDebounced] = useState(termo);
  useEffect(() => { const t = setTimeout(() => setDebounced(termo.trim()), 300); return () => clearTimeout(t); }, [termo]);
  return useQuery({
    queryKey: [...CHAVE, "busca-produto", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => {
      const t = debounced.replace(/[,()*%]/g, " ");
      const { data, error } = await db.from("sncf_produtos")
        .select("sku, cod_cadastro, nome_completo, nome_comercial, preco_site, preco_varejo")
        .eq("ativo", true)
        .or(`sku.ilike.*${t}*,cod_cadastro.ilike.*${t}*,nome_completo.ilike.*${t}*,nome_comercial.ilike.*${t}*`)
        .order("sku").limit(20);
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        sku: p.sku, cod_cadastro: p.cod_cadastro, nome: p.nome_comercial || p.nome_completo || p.sku,
        preco: p.preco_site ?? p.preco_varejo ?? null,
      })) as ProdutoOpcao[];
    },
  });
}

export function useSalvarKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sku: string; nome: string; preco: number | null; componentes: { sku: string; quantidade: number }[]; skuOriginal: string | null }) => {
      const { data, error } = await db.rpc("fn_kit_salvar", {
        p_sku: v.sku, p_nome: v.nome, p_preco: v.preco, p_componentes: v.componentes, p_sku_original: v.skuOriginal,
      });
      if (error) throw error;
      return data as { ok: boolean; acao: string; sku: string; componentes: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

export function useDefinirAtivoKit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { sku: string; ativo: boolean; motivo: string | null }) => {
      const { data, error } = await db.rpc("fn_kit_definir_ativo", { p_sku: v.sku, p_ativo: v.ativo, p_motivo: v.motivo });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}
