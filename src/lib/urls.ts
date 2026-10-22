/**
 * URL pública do app — FONTE ÚNICA da origem dos links externos
 * (página PIX /pagar/:token, portais públicos, callbacks).
 * Nunca usar window.location.origin para links compartilhados externamente:
 * no preview ele vira id-preview--…
 *
 * Resolução: (1) VITE_PUBLIC_APP_URL; (2) `fn_url_publica()` lida uma vez no boot
 * (ver `urlPublicaBoot.ts`); (3) fallback síncrono abaixo enquanto não carregou.
 */
const FALLBACK_PUBLIC_APP_URL = "https://sncf.lovable.app";

const ENV_URL = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || null;

const semBarraFinal = (u: string) => u.replace(/\/+$/, "");

/** Valor de partida (env ou fallback). Use `getPublicAppUrl()` para o valor vigente. */
export const PUBLIC_APP_URL = semBarraFinal(ENV_URL || FALLBACK_PUBLIC_APP_URL);

let urlVigente = PUBLIC_APP_URL;

export function getPublicAppUrl(): string {
  return urlVigente;
}

/** Aplica o valor do banco — ignorado quando a env está definida (ela vence). */
export function definirUrlPublicaDoBanco(valor: string | null | undefined): void {
  if (ENV_URL) return;
  const v = (valor ?? "").trim();
  if (!/^https?:\/\//i.test(v)) return;
  urlVigente = semBarraFinal(v);
}

export function publicUrl(path: string): string {
  return `${urlVigente}${path.startsWith("/") ? path : `/${path}`}`;
}
