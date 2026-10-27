// CORREÇÕES DE NF (27/10/2026): regras puras da aba "Correções de NF" — mesmos textos do bloco fiscal.

export const REENVIO_TXT: Record<string, string> = {
  aguardando_anulacao: "Aguardando anular a NF original",
  enviando: "Reenviando ao Bling…",
  enviado: "Pedido reenviado — aguardando a NF nova",
};

export function textoReenvio(st: string | null, nfNova: string | null, erro: string | null): string | null {
  if (st === "concluido") return `Concluída — NF nova nº ${nfNova ?? "?"}`;
  if (st === "erro") return `Reenvio com erro: ${erro ?? "sem detalhe"}`;
  return st ? (REENVIO_TXT[st] ?? st) : null;
}

/** Prazo de 24h para cancelar no Bling: conta da emissão da NF original (fallback autorização, depois data de emissão). */
export function prazoCancelamento(
  fiscalAcao: string | null,
  nf: { emitida_em?: string | null; autorizada_em?: string | null; data_emissao?: string | null } | null,
): string | null {
  const base = nf?.emitida_em ?? nf?.autorizada_em ?? nf?.data_emissao ?? null;
  return fiscalAcao === "cancelar_nf" && base ? new Date(new Date(base).getTime() + 24 * 3600_000).toISOString() : null;
}

/** Abertas primeiro; entre elas, prazo de cancelamento mais próximo no topo (sem prazo depois); depois mais recentes. */
export function ordenarCorrecoes<T extends { aberta: boolean; prazo: string | null; criado_em: string | null }>(xs: T[]): T[] {
  const t = (v: string | null) => (v ? new Date(v).getTime() : NaN);
  return [...xs].sort((a, b) => {
    if (a.aberta !== b.aberta) return a.aberta ? -1 : 1;
    const pa = t(a.prazo), pb = t(b.prazo);
    if (a.aberta && (Number.isFinite(pa) || Number.isFinite(pb))) {
      if (!Number.isFinite(pa)) return 1;
      if (!Number.isFinite(pb)) return -1;
      if (pa !== pb) return pa - pb;
    }
    return (t(b.criado_em) || 0) - (t(a.criado_em) || 0);
  });
}
