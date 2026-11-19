export function codigoConta(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("Informe uma conta válida");
  const conta = (body as Record<string, unknown>).conta;
  if (conta === undefined) return "MP-SHOPIFY";
  if (typeof conta !== "string" || !conta.trim() || conta.length > 100) throw new Error("Informe uma conta válida");
  return conta;
}