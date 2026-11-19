/** Origem fiscal vem exclusivamente do cadastro; zero é válido, ausência nunca é zero. */
export function origensFiscaisCadastro(
  skus: readonly string[], produtos: readonly { sku: string; origem_fisc: unknown }[],
): Map<string, number> {
  const cadastro = new Map(produtos.map(p => [p.sku, p.origem_fisc]));
  const origens = new Map<string, number>();
  const faltantes: string[] = [];
  for (const sku of new Set(skus)) {
    const valor = cadastro.get(sku);
    const origem = typeof valor === "number" || (typeof valor === "string" && valor.trim() !== "") ? Number(valor) : NaN;
    if (!Number.isInteger(origem) || origem < 0 || origem > 8) faltantes.push(sku);
    else origens.set(sku, origem);
  }
  if (faltantes.length) throw new Error(`SKU(s) sem origem fiscal no cadastro: ${faltantes.join(", ")} — nada foi criado.`);
  return origens;
}