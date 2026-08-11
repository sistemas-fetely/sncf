/**
 * Busca tolerante de título em planilha.
 *
 * Regra: a assinatura de um relatório é o CONTEÚDO, nunca o nome do arquivo
 * (o navegador acrescenta sufixo — "Francesinha (8).xlsx"). A comparação
 * ignora acento e caixa e varre as primeiras linhas em TODAS as colunas.
 */
export function normalizarCelula(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto normalizado das primeiras `limite` linhas, todas as colunas. */
export function textoPrimeirasLinhas(rows: unknown[][], limite = 10): string {
  return rows
    .slice(0, limite)
    .map((r) => (r || []).map(normalizarCelula).join(" | "))
    .join(" // ");
}

/** Título encontrado em qualquer célula das primeiras `limite` linhas. */
export function temTitulo(rows: unknown[][], padrao: RegExp, limite = 10): boolean {
  return padrao.test(textoPrimeirasLinhas(rows, limite));
}
