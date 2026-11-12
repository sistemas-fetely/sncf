import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { juntarColecoesSiteSp, type SaldoSiteSp, type ProdutoColecao } from "./estoqueSiteSp";

export function useSaldoSiteSp(enabled = true) {
  return useQuery({
    queryKey: ["estoque-site-sp", "saldos"],
    enabled,
    queryFn: async () => {
      const linhas: SaldoSiteSp[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase.from("vw_estoque_centro").select("sku,nome_comercial,disponivel,reservado")
          .eq("centro", "SITE-SP").order("sku").range(inicio, inicio + 999);
        if (error) throw error;
        for (const linha of data ?? []) if (linha.sku) linhas.push({ ...linha, sku: linha.sku });
        if (!data || data.length < 1000) return linhas;
      }
    },
  });
}

export function useColecoesSiteSp(enabled = true) {
  return useQuery({
    queryKey: ["estoque-site-sp", "colecoes"],
    enabled,
    queryFn: async () => {
      const produtos: ProdutoColecao[] = [];
      const colecoes: { codigo: string; rotulo: string }[] = [];
      await Promise.all([
        (async () => {
          for (let inicio = 0; ; inicio += 1000) {
            const { data, error } = await supabase.from("sncf_produtos").select("sku,colecao").order("sku").range(inicio, inicio + 999);
            if (error) throw error;
            produtos.push(...(data ?? []));
            if (!data || data.length < 1000) return;
          }
        })(),
        (async () => {
          for (let inicio = 0; ; inicio += 1000) {
            const { data, error } = await supabase.from("produto_colecao_dim").select("codigo,rotulo").order("codigo").range(inicio, inicio + 999);
            if (error) throw error;
            colecoes.push(...(data ?? []));
            if (!data || data.length < 1000) return;
          }
        })(),
      ]);
      return { produtos, colecoes };
    },
  });
}

export { juntarColecoesSiteSp };