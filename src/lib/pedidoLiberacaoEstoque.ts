// Tradução do código de destino retornado pela RPC `liberar_pedido_estoque`
// e pela view `vw_pedido_destino_estoque` para rótulo de apresentação.
// A decisão de destino é do banco — a tela só apresenta.
export const DESTINO_LIBERACAO_LABEL: Record<string, string> = {
  pre_separacao: "Pré-Separação",
  cobranca: "Cobrança",
  aguardando_pagamento: "Aguardando PG",
  em_separacao: "Em separação",
};

export function rotuloDestinoLiberacao(destino: string | null | undefined): string {
  if (!destino) return "próxima fase";
  return DESTINO_LIBERACAO_LABEL[destino] ?? destino;
}
