export type SituacaoPreviaCondicao = "nova" | "ja_existe_ativa" | "ja_existe_inativa";

// Only parse syntax here; the RPC owns deadline validation and all generated fields.
export function parsePrazosCondicao(texto: string): number[] | null {
  const textoLimpo = texto.trim();
  if (!textoLimpo) return [];
  if (!/^\d+(?:[\s/,\-]+\d+)*$/.test(textoLimpo)) return null;
  const dias = textoLimpo.split(/[\s/,\-]+/).map(Number);
  return dias.every(Number.isSafeInteger) ? dias : null;
}

export function podeSalvarCondicaoRapida(
  situacao: SituacaoPreviaCondicao | undefined,
  atualizada: boolean,
  ocupada: boolean,
): boolean {
  return atualizada && !ocupada && (situacao === "nova" || situacao === "ja_existe_inativa");
}