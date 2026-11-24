/**
 * Fonte de leitura de cada conta de pedido (frente PEDIDOS-SIMPLES-E-RAPIDO).
 *
 * LISTA lê a FOTO (replicada a cada minuto, mesmas colunas da view viva);
 * DETALHE, diálogo e qualquer decisão/ação leem a view VIVA. A regra fica aqui
 * como função pura para ser testada sem React.
 */
export const FONTE_PEDIDO = {
  risco: { vivo: "vw_pedido_risco", foto: "vw_foto_pedido_risco" },
  liberacao: {
    vivo: "vw_pedido_liberacao_expedicao",
    foto: "vw_foto_pedido_liberacao",
  },
  situacaoFinanceira: {
    vivo: "vw_pedido_situacao_financeira",
    foto: "vw_foto_pedido_situacao_financeira",
  },
} as const;

export type ChaveFontePedido = keyof typeof FONTE_PEDIDO;

/** `foto = true` → relação replicada; padrão → view viva. */
export function fontePedido(chave: ChaveFontePedido, foto = false): string {
  return foto ? FONTE_PEDIDO[chave].foto : FONTE_PEDIDO[chave].vivo;
}

export const fonteRisco = (foto = false) => fontePedido("risco", foto);
export const fonteLiberacao = (foto = false) => fontePedido("liberacao", foto);
export const fonteSituacaoFinanceira = (foto = false) =>
  fontePedido("situacaoFinanceira", foto);

/** Rótulo da fonte para queryKey: separa cache da foto e cache da view viva. */
export const rotuloFontePedido = (foto = false) => (foto ? "foto" : "vivo");
