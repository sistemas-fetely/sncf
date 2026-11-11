// Regras de valor da aba Documentos (Logística › Custos & Faturas).
// Fonte: vw_logistica_documento_frete — valor_doc (CT-e/postagem) e valor_fatura (fatura da transportadora).

export interface DocumentoComFatura {
  valor_doc: number | null;
  valor_fatura: number | null;
}

/**
 * Valor cobrado do transportador: a fatura manda quando existe;
 * sem fatura, vale o próprio documento (CT-e ou postagem).
 */
export function cobradoTransp(d: DocumentoComFatura): number | null {
  return d.valor_fatura ?? d.valor_doc;
}

/**
 * Divergência CT-e × fatura: só quando os dois valores existem e diferem
 * em mais de R$ 0,01. Retorna os dois valores para o tooltip; null = sem alerta.
 */
export function divergenciaFatura(d: DocumentoComFatura): { valor_cte: number; valor_fatura: number } | null {
  if (d.valor_doc == null || d.valor_fatura == null) return null;
  const cte = Number(d.valor_doc);
  const fatura = Number(d.valor_fatura);
  // Compara em centavos: 18,41 − 18,40 dá 0,010000000000000009 em float e dispararia alerta tolo.
  if (Math.abs(Math.round(fatura * 100) - Math.round(cte * 100)) <= 1) return null;
  return { valor_cte: cte, valor_fatura: fatura };
}
