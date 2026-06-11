/**
 * Determina se um SKU deve ser destacado visualmente nos pedidos.
 * Inclui SKUs fixos de destaque + toda a coleção Lavoire (SKU contém `.LA/`).
 */
export const SKUS_DESTAQUE_FIXOS = [
  "PRTSBRBW.LG.15/01510",
  "PRTSBRBW.CS.15/01501",
];

export function isSkuDestaque(sku: string | null | undefined): boolean {
  if (!sku) return false;
  if (SKUS_DESTAQUE_FIXOS.includes(sku)) return true;
  // Toda coleção Lavoire
  if (sku.includes(".LA/")) return true;
  return false;
}
