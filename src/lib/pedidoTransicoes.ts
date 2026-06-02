import type { EstagioPedido } from "@/types/pedido";

/**
 * Matriz de transições válidas POR INICIATIVA HUMANA.
 *
 * Transições silenciosas (via trigger do banco) NÃO estão aqui:
 *   - analise_credito.status_final = 'aprovado' → pedido vai pra credito_aprovado
 *   - pagamento confirmado → aguardando_pagamento → pre_faturado (trigger)
 *   - sync Bling atualiza em_separacao/faturado/em_transporte/entregue (futuro F-5)
 *
 * Aqui só ficam as transições que UM HUMANO opera explicitamente.
 */
export const TRANSICOES_VALIDAS: Record<EstagioPedido, EstagioPedido[]> = {
  recebido: [
    "em_analise_credito",   // SOps encaminha pra crédito
    "credito_aprovado",     // SOps pula análise (perfis premium/recorrente_bom_pagador)
    "cancelado",
  ],
  em_analise_credito: [
    "cancelado",
    // credito_aprovado é silencioso (trigger quando análise vira aprovada)
  ],
  credito_aprovado: [
    "cobranca",             // SOps materializa proposta de cobrança
    "cancelado",
  ],
  cobranca: [
    "aguardando_pagamento", // SOps confirma materialização / envia link
    "cancelado",
  ],
  aguardando_pagamento: [
    "pre_faturado",         // SOps força avanço (raro — geralmente trigger de pagamento)
    "cancelado",
  ],
  pre_faturado: [
    "em_separacao",         // SOps aperta "Enviar pro Bling" (F-3)
    "recuperacao_venda",    // entrada não paga → SOps migra
    "cancelado",
  ],
  em_separacao: [
    "faturado",             // sync Bling (futuro), mas SOps pode forçar
    "cancelado",
  ],
  faturado: [
    "em_transporte",        // sync Bling (futuro)
  ],
  em_transporte: [
    "entregue",             // sync Bling (futuro)
  ],
  entregue: [],
  cancelado: [],
  recuperacao_venda: [
    "pre_faturado",         // cliente quitou entrada → reverte
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

/**
 * Decide se um pedido pode pular análise de crédito direto pra credito_aprovado.
 *
 * Regra mantida do desenho anterior: perfis `premium` e `recorrente_bom_pagador` pulam.
 * Outros perfis precisam passar pela análise.
 *
 * No novo desenho (v1.1 SNCF-first), pular significa ir direto a credito_aprovado
 * (NÃO mais pra "cobrança boleto" — esse conceito foi descontinuado).
 *
 * IMPORTANTE: quem pula análise não tem humano da Joseph pra setar
 * condicao_final_aprovada manualmente. A condição é derivada automaticamente
 * de condicao_solicitada do FOP. Esse parser entra em F-3.
 */
export function podePularAnaliseCredito(
  perfilCredito: string | null | undefined
): boolean {
  if (!perfilCredito) return false;
  return ["premium", "recorrente_bom_pagador"].includes(perfilCredito);
}

/** @deprecated Use podePularAnaliseCredito. Mantido pra compat retroativa. */
export const podePularAnaliseParaBoleto = podePularAnaliseCredito;
