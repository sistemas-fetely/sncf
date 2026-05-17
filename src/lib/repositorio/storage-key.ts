/**
 * Sanitiza o nome de um arquivo para uso como key no Supabase Storage.
 * Remove acentos, caracteres especiais, espaços. Preserva extensão.
 *
 * Não usar para nome de exibição — apenas para path no bucket.
 * O nome original deve ir para o campo arquivo_original no banco.
 */
export function sanitizeStorageKey(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  const base = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.substring(lastDot) : "";

  const sanitizedBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const sanitizedExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, "");

  const truncated = sanitizedBase.length > 100
    ? sanitizedBase.substring(0, 100)
    : sanitizedBase;

  return (truncated || "arquivo") + sanitizedExt;
}
