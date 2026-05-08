// Helper: extrai mensagem legível de qualquer tipo de erro (Error, string, Postgres/Supabase obj)
export function formatError(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = error as Record<string, any>;
    if (obj.message) return String(obj.message);
    if (obj.error) return String(obj.error);
    if (obj.erro) return String(obj.erro);
    if (obj.details) return String(obj.details);
    if (obj.hint) return String(obj.hint);
    if (obj.code) {
      return `Erro PostgreSQL: ${obj.code}${obj.message ? " - " + obj.message : ""}`;
    }
    try {
      return JSON.stringify(obj);
    } catch {
      return "Erro ao processar erro";
    }
  }
  return "Erro desconhecido";
}
