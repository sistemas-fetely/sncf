/**
 * Detecção de assinatura do arquivo de Retorno CNAB 400 do Banco Safra.
 *
 * Aqui NÃO existe parse: o motor é a edge `processar-retorno-safra`, que
 * registra E aplica (liquidação, baixa, rejeição, prorrogação, movimentação).
 * Este módulo só responde "este arquivo é um retorno do Safra?" para a
 * detecção da fonte na tela de importação.
 */

/** A detecção é pelo conteúdo do header, nunca pelo nome do arquivo. */
export function ehRetornoSafra(texto: string): boolean {
  const primeira = texto.split(/\r\n|\r|\n/)[0] || "";
  return primeira.startsWith("02RETORNO01COBRANCA") && primeira.includes("422SAFRA");
}
