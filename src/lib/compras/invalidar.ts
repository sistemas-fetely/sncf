import type { QueryClient } from "@tanstack/react-query";

/**
 * Doutrina AÇÃO-INVALIDA-LEITURA: toda mutação do módulo Compras de Mercadoria
 * derruba as leituras de lista, detalhe, conferência, saldo e pendências.
 * Uma lista só — nenhuma tela inventa a sua.
 */
export const CHAVES_COMPRAS_MERCADORIA = [
  // listas
  "importacao-pedido-lista",
  "importacao-saldo-pedido-lista",
  "compras-pendencias",
  "compras-pendencias-xpm",
  // detalhe do pedido
  "pedido-mercadoria-detalhe",
  "pedido-mercadoria-linhas",
  "pedido-mercadoria-nfs",
  "pedido-mercadoria-invoices",
  "importacao-pedido-evento",
  // conferência
  "pedido-mercadoria-conferencia-nf",
  "pedido-mercadoria-conferencia-inv",
  // saldo
  "importacao-saldo-pedido",
  "importacao-saldo-sku",
  // rateio / de-para
  "rateio-nf-lista",
  "rateio-nf-worklist",
  "depara-fornecedor-lista",
] as const;

export function invalidarCompras(qc: QueryClient) {
  for (const chave of CHAVES_COMPRAS_MERCADORIA) {
    void qc.invalidateQueries({ queryKey: [chave] });
  }
}
