/**
 * DESCONTINUADO — o cálculo de vencimento sugerido migrou para o banco.
 *
 * A sugestão de vencimento de boleto pendente vem da RPC
 * `fn_cronograma_sugerido_pedido(p_pedido_id uuid)`. A fonte preferencial é a
 * DUPLICATA DA NF (`fonte: "duplicata_nf"`): a data que vale é a que o cliente
 * lê no documento fiscal; qualquer conta nossa que discorde dela está errada
 * por definição. Quando a NF não tem duplicata, a RPC devolve
 * `fonte: "calculado"` (função única do banco — REGRA-NÃO-MORA-EM-TELA).
 *
 * Motivo da migração: PED-2164 — este módulo sugeriu boleto para 02/09
 * (piso de 7 dias hardcoded, âncora em `faturado_em`) enquanto a NF 000392
 * dizia 05/09. A cliente reclamou e ninguém no sistema comparava as duas
 * datas. Havia TRÊS calculadoras de vencimento (esta, `propor_cobranca` no
 * banco e o Bling); esta foi removida.
 *
 * Resta aqui apenas o tipo consumido pela tela Banco Safra.
 */

/** Uma parcela do cronograma devolvido por `fn_cronograma_sugerido_pedido`. */
export interface SugestaoVencimentoParcela {
  /** Data sugerida (ISO yyyy-mm-dd). */
  data: string;
  /** "duplicata_nf" (preferencial, lida da NF) ou "calculado" (fallback do banco). */
  fonte: string;
  /** false quando a data já passou — boleto não se registra com data passada. */
  viavel: boolean;
}
