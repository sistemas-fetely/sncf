import type { EstagioPedido } from "@/types/pedido";

/**
 * Matriz de transições válidas.
 * Inclui tanto as transições automáticas (silenciosas) quanto as manuais de bypass.
 * O backend (transicionar_pedido) não valida a matriz — a barreira é só frontend.
 */
export const TRANSICOES_VALIDAS: Record<EstagioPedido, EstagioPedido[]> = {
  recebido: [
    "em_analise_credito",
    "cobranca",
    "cancelado",
  ],
  em_analise_credito: [
    "cobranca",
    "cancelado",
  ],
  cobranca: [
    "aguardando_pagamento",
    "pre_separacao",
    "cancelado",
  ],
  aguardando_pagamento: [
    "pre_separacao",
    "recuperacao_venda",
    "cancelado",
  ],
  pre_separacao: [
    "em_separacao",
    "aguardando_estoque",
    "recuperacao_venda",
    "cancelado",
  ],
  aguardando_estoque: [
    "pre_separacao",
    "cancelado",
  ],
  em_separacao: [
    "pre_faturamento",
    "faturado",
    "cancelado",
  ],
  pre_faturamento: [
    "faturado",
    "cancelado",
  ],
  faturado: [
    "em_transporte",
  ],
  em_transporte: [
    "entregue",
  ],
  entregue: [],
  cancelado: [],
  recuperacao_venda: [
    "pre_separacao",
    "cancelado",
  ],
};

export function isEstagioFinal(estagio: EstagioPedido): boolean {
  return estagio === "entregue" || estagio === "cancelado";
}

export function podeTransicionar(estagio: EstagioPedido): boolean {
  return TRANSICOES_VALIDAS[estagio].length > 0;
}

export function transicoesPara(estagio: EstagioPedido): EstagioPedido[] {
  return TRANSICOES_VALIDAS[estagio];
}

export function podePularAnaliseCredito(
  perfilCredito: string | null | undefined
): boolean {
  if (!perfilCredito) return false;
  return ["premium", "recorrente_bom_pagador"].includes(perfilCredito);
}

/** @deprecated Use podePularAnaliseCredito. Mantido pra compat retroativa. */
export const podePularAnaliseParaBoleto = podePularAnaliseCredito;

export function ehFormaAVista(forma: string | null | undefined): boolean {
  const f = (forma ?? "").toLowerCase().trim();
  return f.includes("pix") || f.includes("cartao") || f.includes("cartão");
}
