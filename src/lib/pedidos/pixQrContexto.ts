/**
 * PIX do pedido B2B (23/11/2026): no B2B fica só o "Gerar link PIX Safra",
 * igual já feito em 19/11 na Venda Direta/Site SP e no FOP B2C.
 *
 * O bloco "PIX na hora (QR)" deixa de ser oferecido nas parcelas PIX pendentes
 * (novas e antigas). Um QR já gerado antes continua aparecendo, porém em modo
 * leitura — sem botão de gerar. A lógica/edge do QR não é apagada: só não
 * renderiza nesse contexto.
 */

/** Canal que não oferece mais QR novo. */
export const CANAL_SEM_QR_PIX_NOVO = "B2B";

/** O canal do pedido esconde o bloco de QR novo? (compara sem caixa nem espaços) */
export function canalEscondeQrPixNovo(canal: string | null | undefined): boolean {
  return String(canal ?? "").trim().toUpperCase() === CANAL_SEM_QR_PIX_NOVO;
}

/** Campos de uma parcela/portão que denunciam um QR já existente. */
export interface LinhaComQrPix {
  link_pagamento?: string | null;
  pix_txid?: string | null;
  pix_qr_url?: string | null;
  pix_token?: string | null;
}

/**
 * QR já foi gerado: payload EMV + identificador na linha, ou a imagem/página
 * pública já foram registrados (pix_qr_url / pix_token).
 */
export function qrPixJaGerado(l: LinhaComQrPix): boolean {
  const payloadPronto = !!l.link_pagamento && !!l.pix_txid;
  return payloadPronto || !!l.pix_qr_url || !!l.pix_token;
}

/**
 * Linhas PIX que ainda mostram o bloco de QR. Com `esconderQrPix` ligado, só
 * entram as que já têm QR (modo leitura); sem ligar, todas como hoje.
 */
export function linhasQrPixVisiveis<T extends LinhaComQrPix>(
  linhas: T[],
  esconderQrPix: boolean,
): T[] {
  return esconderQrPix ? linhas.filter(qrPixJaGerado) : linhas;
}
