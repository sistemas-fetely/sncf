export function idNumerico(gid: unknown): string | null {
  const id = String(gid ?? "").split("/").pop() ?? "";
  return /^\d+$/.test(id) ? id : null;
}
interface ProdutoAtributos {
  id?: unknown; descriptionHtml?: string; seo?: { title?: string; description?: string };
  category?: { fullName?: string }; templateSuffix?: string;
  collections?: { nodes?: { title: string }[]; pageInfo?: { hasNextPage?: boolean } };
  metafields?: { nodes?: { namespace: string; key: string; value: string }[]; pageInfo?: { hasNextPage?: boolean } };
}
export function atributosProduto(p: ProdutoAtributos, pullEm: string) {
  const id = idNumerico(p.id);
  if (!id) return null;
  return { shopify_id: id, description_html: p.descriptionHtml ?? null,
    seo_title: p.seo?.title ?? null, seo_description: p.seo?.description ?? null,
    category_full_name: p.category?.fullName ?? null, template_suffix: p.templateSuffix ?? null,
    colecoes: (p.collections?.nodes ?? []).map(c => c.title),
    metafields: Object.fromEntries((p.metafields?.nodes ?? []).map(m => [`${m.namespace}.${m.key}`, m.value])), lido_em: pullEm };
}
interface InventoryItem {
  id?: unknown; tracked?: boolean; requiresShipping?: boolean; countryCodeOfOrigin?: string;
  harmonizedSystemCode?: string; unitCost?: { amount?: string | number; currencyCode?: string };
}
export function atributosInventory(item: InventoryItem | null | undefined, sku: string | null, pullEm: string) {
  const id = idNumerico(item?.id);
  if (!id || !item) return null;
  const amount = item.unitCost?.amount;
  const cost = amount == null || amount === "" ? null : Number(amount);
  return { inventory_item_id: id, sku, tracked: item.tracked ?? null,
    unit_cost: cost != null && Number.isFinite(cost) ? cost : null,
    unit_cost_moeda: item.unitCost?.currencyCode ?? null,
    country_code_of_origin: item.countryCodeOfOrigin ?? null,
    harmonized_system_code: item.harmonizedSystemCode ?? null,
    requires_shipping: item.requiresShipping ?? null, lido_em: pullEm };
}
export function custoExcedido(body: { extensions?: { cost?: { requestedQueryCost?: number } }; errors?: { message?: string; extensions?: { code?: string } }[] }): boolean {
  return (body.extensions?.cost?.requestedQueryCost ?? 0) > 1000 ||
    (body.errors ?? []).some(e => e.extensions?.code === "MAX_COST_EXCEEDED" || /query cost.*(exceed|maximum)|exceeds.*max cost/i.test(e.message ?? ""));
}