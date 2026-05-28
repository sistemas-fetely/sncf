import type { EstagioPedido } from "@/types/pedido";

export const TRANSICOES_VALIDAS: Record<EstagioPedido, EstagioPedido[]> = {
  recebido: [
    "em_analise_credito",
    "em_cobranca_cartao",
    "em_cobranca_pix",
    "em_cobranca_boleto",
    "cancelado",
  ],
  em_analise_credito: [
    "em_cobranca_cartao",
    "em_cobranca_pix",
    "em_cobranca_boleto",
    "cancelado",
  ],
  em_cobranca: ["pronto_pro_bling", "cancelado"], // legado, mantido
  em_cobranca_cartao: ["pronto_pro_bling", "cancelado"],
  em_cobranca_pix: ["pronto_pro_bling", "cancelado"],
  em_cobranca_boleto: ["pronto_pro_bling", "cancelado"],
  pronto_pro_bling: ["em_separacao", "faturado", "cancelado"],
  em_separacao: ["faturado", "cancelado"],
  faturado: ["em_transporte"],
  em_transporte: ["entregue"],
  entregue: [],
  cancelado: [],
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

/**
 * Decide se um pedido pode pular análise de crédito direto pra cobrança boleto.
 * Regra: perfis premium e recorrente_bom_pagador pulam.
 * Outros perfis precisam passar pela análise.
 *
 * Usado no dialog de triagem (C.3) pra habilitar/desabilitar
 * o botão "Boleto direto" vs "Boleto via análise".
 */
export function podePularAnaliseParaBoleto(
  perfilCredito: string | null | undefined
): boolean {
  if (!perfilCredito) return false;
  return ["premium", "recorrente_bom_pagador"].includes(perfilCredito);
}
