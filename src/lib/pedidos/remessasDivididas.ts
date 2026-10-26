/**
 * TELA-NÃO-SURPREENDE (26/10/2026): a edge `enviar-pedido-bling` recusa o envio
 * INICIAL (sem remessa_id) quando o pedido já tem 2+ remessas ativas
 * (`Pedido já possui N remessa(s) ativa(s)...`). O botão geral "Enviar ao Bling"
 * desabilita ANTES do clique quando a mesma condição existe — a regra mora na
 * edge; aqui só espelhamos o veredito para o operador não descobrir por 409.
 */

export interface RemessaMinima {
  status: string;
}

/** Remessa ativa = status ≠ cancelada (mesma contagem da edge). */
export function remessasAtivas(remessas: RemessaMinima[] | null | undefined): RemessaMinima[] {
  return (remessas ?? []).filter((r) => r.status !== "cancelada");
}

/** Pedido dividido: 2+ remessas ativas — o envio inicial genérico é recusado. */
export function pedidoDividido(remessas: RemessaMinima[] | null | undefined): boolean {
  return remessasAtivas(remessas).length > 1;
}
