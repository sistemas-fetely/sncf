import { humanizeError } from "@/lib/errorMessages";

/**
 * Extrai mensagem legível de qualquer erro e a humaniza.
 *
 * ATENÇÃO: o erro do PostgREST é declarado como PostgrestError (extends Error),
 * mas em runtime o PostgrestBuilder faz JSON.parse e NUNCA instancia a classe.
 * O objeto no catch é plano, então `e instanceof Error` é false e String(e)
 * produz "[object Object]". O TypeScript aprova esse idioma; o runtime não.
 * Nunca use `e instanceof Error ? e.message : String(e)` — use formatError(e).
 * (Travado por ESLint: no-restricted-syntax)
 */
export function formatError(error: unknown): string {
  return humanizeError(rawMessage(error));
}

/** Mensagem técnica sem humanização — para log/console. */
export function rawMessage(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;

    const ctx = obj.context as Record<string, unknown> | undefined;
    if (ctx && typeof ctx.body === "string" && ctx.body.trim()) {
      return `${str(obj.message) || "Erro na função"} — ${ctx.body.trim()}`;
    }

    const base = str(obj.message) || str(obj.error) || str(obj.erro);
    const extra = [str(obj.details), str(obj.hint)].filter(Boolean).join(" · ");
    if (base) return extra ? `${base} — ${extra}` : base;
    if (extra) return extra;
    if (obj.code) return `Erro no banco (${str(obj.code)})`;

    try {
      const j = JSON.stringify(obj);
      return j === "{}" ? "Erro desconhecido" : j;
    } catch {
      return "Erro desconhecido";
    }
  }
  return "Erro desconhecido";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v);
}
