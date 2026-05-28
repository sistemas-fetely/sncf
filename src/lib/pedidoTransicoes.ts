import type { EstagioPedido } from "@/types/pedido";

export const TRANSICOES_VALIDAS: Record<EstagioPedido, EstagioPedido[]> = {
  recebido: ["em_analise_credito", "em_cobranca", "cancelado"],
  em_analise_credito: ["em_cobranca", "cancelado"],
  em_cobranca: ["pronto_pro_bling", "cancelado"],
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
