/**
 * URL pública do app — usada para gerar links externos
 * (candidatos, convites, portais públicos).
 * Nunca usar window.location.origin para links compartilhados externamente.
 */
export const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL
  || "https://sncf.lovable.app";

export function publicUrl(path: string): string {
  return `${PUBLIC_APP_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
