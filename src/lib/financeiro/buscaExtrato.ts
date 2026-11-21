/** Reconhece somente números completos; CPF/CNPJ formatados permanecem texto. */
export function valorBuscaExtrato(texto: string): number | null {
  const t = texto.trim().replace(/^([+-]?)\s*R\$\s*/i, "$1").replace(/\s+/g, "");
  if (!/^[+-]?(?:\d+(?:[.,]\d{1,2})?|\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)$/.test(t)) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".")
    : /^[+-]?\d{1,3}(?:\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

export function filtroBuscaExtrato(texto: string): string | null {
  const termo = texto.trim();
  if (!termo) return null;
  const t = termo.replace(/[,%()"\\]/g, " ");
  const campos = ["descricao", "contraparte_nome", "contraparte_documento", "referencia_pedido"];
  const partes = campos.map(c => `${c}.ilike.%${t}%`);
  const valor = valorBuscaExtrato(termo);
  if (valor !== null) partes.push(`and(valor_abs.gte.${Math.max(0, valor - 0.01).toFixed(2)},valor_abs.lte.${(valor + 0.01).toFixed(2)})`);
  return partes.join(",");
}