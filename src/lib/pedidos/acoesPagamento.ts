export function podeAcionarPagamento(estagio?: string | null, canceladoEm?: string | null): boolean {
  return !canceladoEm && (estagio === "aguardando_pagamento" || estagio === "cobranca");
}