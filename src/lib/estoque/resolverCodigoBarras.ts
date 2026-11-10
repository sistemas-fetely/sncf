export interface ProdutoBarras {
  sku: string;
  ean: string | null;
  dun: string | null;
  cod_cadastro: string | null;
  nome_comercial: string | null;
  inner_qtd: number | null;
}
export interface CodigoBarrasResolvido {
  sku: string;
  cod: string | null;
  nome: string | null;
  tipo: "ean" | "cod" | "sku" | "dun";
  dun?: string;
  innerQtd?: number | null;
}
export function normalizarGtin(v: string | null | undefined): string {
  const n = (v ?? "").trim().replace(/\s+/g, "");
  return /^\d{1,14}$/.test(n) && /[1-9]/.test(n) ? n.padStart(14, "0") : "";
}
export function normalizarLeitura(v: string): string {
  return v.trim().replace(/\s+/g, "").toUpperCase();
}
export interface IndiceBarras {
  ean: Map<string, CodigoBarrasResolvido>;
  cod: Map<string, CodigoBarrasResolvido>;
  sku: Map<string, CodigoBarrasResolvido>;
  dun: Map<string, CodigoBarrasResolvido>;
}
export function montarIndiceBarras(produtos: ProdutoBarras[]): IndiceBarras {
  const indice: IndiceBarras = { ean: new Map(), cod: new Map(), sku: new Map(), dun: new Map() };
  for (const p of produtos) {
    const base = { sku: p.sku, cod: p.cod_cadastro, nome: p.nome_comercial };
    const ean = normalizarGtin(p.ean); const dun = normalizarGtin(p.dun);
    if (ean && !indice.ean.has(ean)) indice.ean.set(ean, { ...base, tipo: "ean" });
    if (p.cod_cadastro) indice.cod.set(p.cod_cadastro.trim(), { ...base, tipo: "cod" });
    indice.sku.set(p.sku.trim().toLowerCase(), { ...base, tipo: "sku" });
    if (dun && !indice.dun.has(dun)) indice.dun.set(dun, { ...base, tipo: "dun", dun: p.dun ?? undefined, innerQtd: p.inner_qtd });
  }
  return indice;
}
export function resolverCodigoBarras(codigo: string, indice: IndiceBarras | undefined): CodigoBarrasResolvido | null {
  if (!indice) return null;
  const bruto = codigo.trim(); const gtin = normalizarGtin(bruto);
  return (gtin ? indice.ean.get(gtin) : undefined) ?? indice.cod.get(bruto)
    ?? indice.sku.get(bruto.toLowerCase()) ?? (gtin ? indice.dun.get(gtin) : undefined) ?? null;
}
export function unidadesCodigoBarras(p: CodigoBarrasResolvido, qtd: number): number | null {
  if (p.tipo !== "dun") return qtd;
  return p.innerQtd != null && Number.isFinite(p.innerQtd) && p.innerQtd > 1 ? p.innerQtd * qtd : null;
}