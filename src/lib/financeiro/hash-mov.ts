/**
 * Gera hash determinístico para anti-duplicata de movimentações bancárias.
 * Usa SHA-256 via Web Crypto (síncrono via fallback simples se não disponível).
 */

export async function gerarHashMov(
  contaId: string,
  data: string,
  valor: number,
  descricao: string,
  fitid?: string
): Promise<string> {
  // Se tem FITID, usar como chave principal — elimina duplicatas do Itaú
  // (mesmo evento, descrições diferentes em arquivos consecutivos)
  const base = fitid
    ? `${contaId}|${fitid}`
    : `${contaId}|${data}|${valor.toFixed(2)}|${descricao.trim().toLowerCase()}`;
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(base);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: hash simples (improvável de cair aqui em browsers modernos)
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return String(h);
}
