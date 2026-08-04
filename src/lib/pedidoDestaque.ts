import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Estoque virtual (disponível = contábil − reservado) por SKU, lido de vw_estoque.
 * Substituiu o antigo destaque fixo por coleção (Lavoire + 2 SKUs fixos) — decisão
 * de 03/08/2026: o alerta nas telas de pedido passou a ser 100% sobre estoque
 * zerado, não mais sobre "cuidado especial no manuseio".
 */
export async function buscarEstoqueVirtualPorSkus(
  skus: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const unicos = Array.from(new Set(skus.filter((s): s is string => !!s)));
  const mapa = new Map<string, number>();
  if (unicos.length === 0) return mapa;

  const { data, error } = await (supabase as any)
    .from("vw_estoque")
    .select("sku, estoque_virtual")
    .in("sku", unicos);

  if (error) throw new Error(`[estoque] falha ao buscar estoque_virtual: ${error.message}`);

  for (const row of data ?? []) {
    mapa.set(row.sku, Number(row.estoque_virtual ?? 0));
  }
  return mapa;
}

/**
 * Um SKU está "sem estoque" quando estoque_virtual <= 0.
 * SKU ausente em vw_estoque (sem lastro/sem linha) é tratado como sem estoque —
 * mais seguro para o time de separação do que assumir disponibilidade.
 */
export function isSemEstoque(
  sku: string | null | undefined,
  estoqueVirtualPorSku: Map<string, number>,
): boolean {
  if (!sku) return false;
  const virtual = estoqueVirtualPorSku.get(sku);
  if (virtual === undefined) return true;
  return virtual <= 0;
}

/** Hook: busca em lote o estoque virtual dos SKUs informados (dedup automático). */
export function useEstoqueVirtualPorSkus(skus: (string | null | undefined)[]) {
  const chave = Array.from(new Set(skus.filter((s): s is string => !!s))).sort().join("|");
  return useQuery({
    queryKey: ["estoque-virtual-por-skus", chave],
    queryFn: () => buscarEstoqueVirtualPorSkus(skus),
    enabled: chave.length > 0,
    staleTime: 60 * 1000,
  });
}
