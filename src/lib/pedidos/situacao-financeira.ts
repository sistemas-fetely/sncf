import type { SituacaoFinanceira } from "@/types/pedido";

/**
 * Tom visual de cada situação financeira — FONTE ÚNICA na UI.
 * A view `vw_pedido_situacao_financeira` deriva a classificação de
 * `fn_pedido_tem_lastro`; quatro valores (sem_cobranca, previsto,
 * coberto_haver, recebivel_familia) antes caíam em `sem_recebivel` e
 * NÃO são estados de alerta — só `sem_recebivel` e `vencido` são.
 */
export type TomSituacao = "neutro" | "info" | "positivo" | "alerta" | "critico";

export interface SituacaoMeta {
  /** Rótulo curto de fallback quando o banco não manda `situacao_rotulo`. */
  label: string;
  tom: TomSituacao;
  /** true = precisa de ação/cobrança. */
  alerta: boolean;
}

export const TOM_CLASSES: Record<TomSituacao, string> = {
  neutro: "bg-muted text-foreground border-0",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200 border-0",
  positivo:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 border-0",
  alerta:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200 border-0",
  critico: "bg-destructive text-destructive-foreground border-0",
};

export const SITUACAO_FINANCEIRA_META: Record<SituacaoFinanceira, SituacaoMeta> = {
  quitado: { label: "Quitado", tom: "positivo", alerta: false },
  parcial_pago: { label: "Parcial pago", tom: "info", alerta: false },
  em_aberto: { label: "Em aberto", tom: "neutro", alerta: false },
  vencido: { label: "Vencido", tom: "critico", alerta: true },
  anulado: { label: "Anulado", tom: "neutro", alerta: false },
  sem_recebivel: { label: "Sem recebível", tom: "alerta", alerta: true },
  sem_cobranca: { label: "Sem cobrança", tom: "neutro", alerta: false },
  previsto: { label: "Cobrança prevista", tom: "info", alerta: false },
  coberto_haver: { label: "Coberto por haver", tom: "positivo", alerta: false },
  recebivel_familia: { label: "Recebível na mãe", tom: "info", alerta: false },
};

export function metaSituacao(
  situacao: SituacaoFinanceira | string | null | undefined,
): SituacaoMeta | null {
  if (!situacao) return null;
  return SITUACAO_FINANCEIRA_META[situacao as SituacaoFinanceira] ?? null;
}

/** Classe do badge para uma situação (fallback neutro para valor desconhecido). */
export function classeSituacao(
  situacao: SituacaoFinanceira | string | null | undefined,
): string {
  return TOM_CLASSES[metaSituacao(situacao)?.tom ?? "neutro"];
}

/**
 * Texto exibido ao usuário. Preferimos a frase pronta do banco
 * (`situacao_rotulo` / `lastro_porque`) e nunca renderizamos o código cru.
 */
export function rotuloSituacao(
  situacao: SituacaoFinanceira | string | null | undefined,
  rotuloBanco?: string | null,
  lastroPorque?: string | null,
): string {
  const texto = (rotuloBanco || "").trim() || (lastroPorque || "").trim();
  if (texto) return texto;
  return metaSituacao(situacao)?.label ?? "—";
}
