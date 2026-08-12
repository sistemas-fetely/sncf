/**
 * Resolução ÚNICA do e-mail de cobrança de um parceiro.
 *
 * Precedência:
 *   1º contatos -> 'financeiro' ->> 'email'  (objeto JSON, NÃO array)
 *   2º email_cobranca
 *   3º email
 */

export interface ParceiroEmails {
  email?: string | null;
  email_cobranca?: string | null;
  contatos?: unknown;
}

export type OrigemEmailCobranca = "financeiro" | "email_cobranca" | "email" | null;

function emailDoFinanceiro(contatos: unknown): string | null {
  if (!contatos || typeof contatos !== "object" || Array.isArray(contatos)) return null;
  const fin = (contatos as Record<string, unknown>).financeiro;
  if (!fin || typeof fin !== "object" || Array.isArray(fin)) return null;
  const email = (fin as Record<string, unknown>).email;
  if (typeof email !== "string") return null;
  const t = email.trim();
  return t.length > 0 ? t : null;
}

export function resolverEmailCobranca(
  parceiro: ParceiroEmails | null | undefined,
): { email: string | null; origem: OrigemEmailCobranca } {
  if (!parceiro) return { email: null, origem: null };

  const fin = emailDoFinanceiro(parceiro.contatos);
  if (fin) return { email: fin, origem: "financeiro" };

  const cob = parceiro.email_cobranca?.trim();
  if (cob) return { email: cob, origem: "email_cobranca" };

  const principal = parceiro.email?.trim();
  if (principal) return { email: principal, origem: "email" };

  return { email: null, origem: null };
}

/** Só o endereço, para uso direto em prefill de campo. */
export function emailCobrancaPreferido(parceiro: ParceiroEmails | null | undefined): string | null {
  return resolverEmailCobranca(parceiro).email;
}
