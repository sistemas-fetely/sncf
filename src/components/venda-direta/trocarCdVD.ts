export interface PedidoTrocaCdVD {
  id: string;
  id_externo: string | null;
  estagio: string | null;
  nf_numero: string | number | null;
  cancelado_em: string | null;
  modal: string | null;
}

export const podeTrocarCdVD = (p: PedidoTrocaCdVD) =>
  !p.cancelado_em && p.nf_numero == null &&
  ["aguardando_pagamento", "cobranca", "pre_faturamento"].includes(p.estagio ?? "");

export const exigeTransportadoraVD = (modal: string | null) => modal === "retirada" || modal === "balcao";

export const podeConfirmarTrocaCdVD = (centro: string, motivo: string, modal: string | null, transportadora: string) =>
  !!centro && motivo.trim().length >= 3 && (!exigeTransportadoraVD(modal) || !!transportadora);

export function argsTrocaCdVD(pedidoId: string, centro: string, motivo: string, transportadora: string) {
  return { p_pedido_id: pedidoId, p_centro_codigo: centro, p_motivo: motivo.trim(), p_transportadora_id: transportadora || null };
}