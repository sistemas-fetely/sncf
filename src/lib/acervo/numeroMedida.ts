// Exibição de medidas em pt-BR: vírgula decimal, no máximo N casas, sem zeros à direita.
// Só exibição — nunca usar para comparação, payload ou gravação.
const MEDIDA = /peso|altura|largura|profundidade|comprimento|diametro|dimens|preco|custo/i;
const NUMERO_PURO = /^\s*-?\d+(?:[.,]\d+)?\s*$/;

/** Só campos de medida (peso, altura, largura…) são formatados; códigos como gtin, ncm, marca não. */
export function campoDeMedida(campo: string | null | undefined): boolean {
  return !!campo && MEDIDA.test(campo);
}

/** number ou string de número puro → "0,0693"; "16" → "16"; não numérico → null. */
export function numeroMedida(v: unknown, casas = 4): string | null {
  let n: number | null = null;
  if (typeof v === "number") n = Number.isFinite(v) ? v : null;
  else if (typeof v === "string" && NUMERO_PURO.test(v)) n = Number(v.trim().replace(",", "."));
  if (n === null || !Number.isFinite(n)) return null;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}
