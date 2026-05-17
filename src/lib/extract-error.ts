/**
 * Extrai mensagem legível de qualquer formato de erro.
 * Doutrina #120 — substitui `String(e)` que gera "[object Object]" pra erros do Supabase.
 */
export function extractError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null) {
    const obj = e as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.length > 0) return obj.message;
    if (typeof obj.details === "string" && obj.details.length > 0) return obj.details;
    if (typeof obj.hint === "string" && obj.hint.length > 0) return obj.hint;
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erro desconhecido";
    }
  }
  return String(e ?? "Erro desconhecido");
}
