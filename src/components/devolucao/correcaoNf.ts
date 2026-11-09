// CORREÇÕES DE NF (27/10/2026): regras puras da aba "Correções de NF" — mesmos textos do bloco fiscal.

export type StatusNfSub = "gerando" | "rascunho" | "autorizada" | "erro" | null;

export function textoReenvio(st: StatusNfSub, nfNova: string | null, erro: string | null, originalAnulada = false): string | null {
  if (st === "gerando") return "Gerando a NF nova no Bling…";
  if (st === "rascunho") return `NF nova nº ${nfNova ?? "?"} em rascunho no Bling — Fiscal valida e transmite`;
  if (st === "autorizada") return `NF nova nº ${nfNova ?? "?"} autorizada ✓`;
  if (st === "erro") return erro ?? "Falha ao gerar a NF nova — sem detalhe registrado.";
  return originalAnulada ? "Aguardando gerar a NF nova" : "Aguardando anular a NF original";
}

export function podeGerarNfSubstituta(originalAnulada: boolean, status: StatusNfSub, encerrada: boolean): boolean {
  return originalAnulada && !encerrada && (status === null || status === "erro");
}

export const ehCancelamentoComNf = (finalidade: string | null | undefined) => finalidade === "devolucao";

/** Estágios em que se pode pedir correção: com NF emitida. Na venda direta a NF sai ANTES da separação. */
export const ESTAGIOS_CORRIGIR_NF: string[] = ["faturado", "pre_separacao", "em_separacao", "em_transporte", "entregue"];

/**
 * Quem pode pedir correção de NF (09/11/2026): B2B ou venda direta (pedidos.origem = 'venda_direta',
 * canal B2C), pedido não cancelado e em estágio com NF. A prévia do banco (dry_run) é o juiz final.
 */
export function podeCorrigirNf(p: {
  canal?: string | null; origem?: string | null; estagio?: string | null; cancelado_em?: string | null;
}): boolean {
  const dono = p.canal === "B2B" || p.origem === "venda_direta";
  return dono && p.estagio !== "cancelado" && !p.cancelado_em && ESTAGIOS_CORRIGIR_NF.includes(p.estagio ?? "");
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
