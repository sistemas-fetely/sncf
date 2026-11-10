import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { montarIndiceBarras, resolverCodigoBarras, normalizarGtin, type ProdutoBarras } from "@/lib/estoque/resolverCodigoBarras";

export const queryCodigosBarras = {
  queryKey: ["estoque-resolver-gtin14"],
  staleTime: 30_000,
  queryFn: async () => {
    const produtos: Omit<ProdutoBarras, "inner_qtd">[] = [];
    const inner = new Map<string, number | null>();
    // Stable paginated reads once per cache, never a table scan per beep.
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("sncf_produtos")
        .select("sku,ean,dun,cod_cadastro,nome_comercial").order("sku").range(de, de + 999);
      if (error) throw error;
      for (const p of data ?? []) if (p.sku) produtos.push({ ...p, sku: p.sku });
      if (!data || data.length < 1000) break;
    }
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("cartorio_codigo")
        .select("dun,inner_qtd").not("dun", "is", null).order("dun").range(de, de + 999);
      if (error) throw error;
      for (const c of data ?? []) {
        const chave = normalizarGtin(c.dun);
        if (chave) inner.set(chave, c.inner_qtd);
      }
      if (!data || data.length < 1000) break;
    }
    return montarIndiceBarras(produtos.map((p) => ({ ...p, inner_qtd: inner.get(normalizarGtin(p.dun)) ?? null })));
  },
};
export function useResolverCodigoBarras(enabled = true) {
  const query = useQuery({ ...queryCodigosBarras, enabled });
  return { ...query, resolver: (codigo: string) => resolverCodigoBarras(codigo, query.data) };
}