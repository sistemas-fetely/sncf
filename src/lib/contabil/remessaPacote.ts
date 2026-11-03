/** Pacote do Contador v2 — regras puras de acompanhamento da remessa (testadas). */

export const HEARTBEAT_PARADO_MS = 90_000;

export interface ProgressoRemessa {
  etapa?: string;
  etapa_rotulo?: string;
  pausado?: boolean;
  atualizado_em?: string;
  feitos?: number;
  proxima?: number;
  total_entradas?: number;
  entradas?: unknown[];
}

/** A geração precisa de uma nova chamada à rotina: pausou por tempo ou parou de dar sinal. */
export function precisaRetomar(status: string | null | undefined, p: ProgressoRemessa | null | undefined, agora = Date.now()): boolean {
  if (status !== "gerando" || !p) return false;
  if (p.pausado) return true;
  if (!p.atualizado_em) return false;
  return agora - new Date(p.atualizado_em).getTime() > HEARTBEAT_PARADO_MS;
}

/** Percentual da barra de etapa (0–100). */
export function percentualRemessa(status: string | null | undefined, p: ProgressoRemessa | null | undefined): number {
  if (status === "pronto") return 100;
  if (!p) return 0;
  const total = Array.isArray(p.entradas) ? p.entradas.length : p.total_entradas ?? 0;
  if (p.etapa === "manifesto") return 95;
  if (p.etapa === "links") return 98;
  if (!total) return p.etapa === "listando" ? 5 : 2;
  const feitos = Math.max(p.feitos ?? 0, p.proxima ?? 0);
  return Math.min(94, 10 + Math.round((feitos / total) * 84));
}

/** Link vencido (ou ausente) para remessa pronta. */
export function linkExpirado(expiraEm: string | null | undefined, agora = Date.now()): boolean {
  return !expiraEm || new Date(expiraEm).getTime() < agora;
}
