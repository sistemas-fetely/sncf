import type { EstadoSelo } from "@/components/ui/selo";

/**
 * Dicionário de status de `xpm_nf_fila` para a trilha do pedido (VinculosSection).
 *
 * `aguardando_xpm` (25/11/2026): a NF fica represada no SNCF até a XPM devolver a
 * fase Conferido; depois vira `pendente` e é enviada sozinha. Por isso ela é tom de
 * espera, sem botão de reenvio e sem ler como erro.
 *
 * `pendente` e `erro` continuam aparecendo como AÇÃO (botão de envio), não como selo.
 */
export const STATUS_AGUARDANDO_XPM = "aguardando_xpm";

export interface NfFilaStatusMeta {
  rotulo: string;
  estado: EstadoSelo;
  tooltip: string;
  /** Só o que depende do SNCF empurrar a NF ganha botão de reenvio. */
  podeReenviar: boolean;
}

const METAS: Record<string, NfFilaStatusMeta> = {
  [STATUS_AGUARDANDO_XPM]: {
    rotulo: "Aguardando conferência da XPM",
    estado: "info",
    tooltip: "A NF é enviada sozinha quando a XPM concluir a conferência do pedido.",
    podeReenviar: false,
  },
};

/** Meta de display do status, ou null quando o status não é dos que a trilha rotula. */
export function nfFilaStatusMeta(
  status: string | null | undefined,
): NfFilaStatusMeta | null {
  if (!status) return null;
  return METAS[status] ?? null;
}

/** `pendente` e `erro` são as únicas linhas que o operador pode reenviar. */
export function nfFilaPodeReenviar(status: string | null | undefined): boolean {
  return status === "pendente" || status === "erro";
}

/** A trilha mostra o que o operador pode reenviar e o que só espera a XPM. */
export function nfFilaApareceNaTrilha(status: string | null | undefined): boolean {
  return nfFilaPodeReenviar(status) || nfFilaStatusMeta(status) !== null;
}
