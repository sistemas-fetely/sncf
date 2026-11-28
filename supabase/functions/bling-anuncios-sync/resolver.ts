// Resolução produto Bling → produto SNCF (B1 · 28/11/2026).
// Ordem: bling_card_canonico.bling_id → sku; fallback bling_produtos_cache.bling_produto_id → sku;
// o sku só vale se existir em sncf_produtos (por sku ou cod_cadastro). Sem casamento = vínculo quebrado.
export type ProdutoSncf = { sku: string; cod_cadastro: string | null };
export type Mapas = {
  canonico: Map<string, string>; // bling_id (text) → sku
  cache: Map<string, string>; // bling_produto_id (text) → sku
  sncf: Map<string, ProdutoSncf>; // UPPER(sku) e UPPER(cod_cadastro) → produto
};
export function resolverProduto(produtoBlingId: number | string | null | undefined, m: Mapas): ProdutoSncf | null {
  if (produtoBlingId == null || produtoBlingId === "") return null;
  const k = String(produtoBlingId);
  for (const sku of [m.canonico.get(k), m.cache.get(k)]) {
    if (!sku) continue;
    const p = m.sncf.get(sku.trim().toUpperCase());
    if (p) return p;
  }
  return null;
}
/** Preço do Bling vem como float (24.899999…): compara e grava em centavos. */
export const centavos = (v: unknown) => v == null || v === "" || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100;
/** Precisa buscar o detalhe? Novo, completo, ou preço/situação/título diferente do espelho. */
export function precisaDetalhe(item: any, espelho: { preco: number | null; situacao: number | null; titulo: string | null } | undefined, completo: boolean) {
  if (completo || !espelho) return true;
  const preco = item?.preco?.valor ?? item?.preco ?? null;
  return centavos(preco) !== centavos(espelho.preco) || (item?.situacao ?? null) !== espelho.situacao || (item?.titulo ?? item?.nome ?? null) !== espelho.titulo;
}
