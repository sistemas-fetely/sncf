/** Meios de pagamento da Venda Direta (código da regra de pagamento do pedido). */
export type MeioVD = "pix" | "cartao" | "cartao_maquininha";

export const ROTULO_MEIO_VD: Record<MeioVD, string> = {
  pix: "PIX",
  cartao: "Cartão (link)",
  cartao_maquininha: "Cartão maquininha",
};

/** Pagamento escolhido no Novo pedido: meio de cobrança ou bonificação (sem cobrança). */
export type PagamentoVD = MeioVD | "bonificacao";

/** Bonificação (27/10/2026): pedido sem cobrança — não conta como aguardando pagamento. */
export const ehBonificacao = (p: string | null | undefined) => p === "bonificacao";

/** Rótulo para exibição de qualquer pagamento da VD, inclusive bonificação. */
export function rotuloPagamentoVD(p: string | null | undefined): string {
  return ehBonificacao(p) ? "Bonificação" : ROTULO_MEIO_VD[meioVD(p)];
}

/** Normaliza o pagamento vindo do banco; qualquer cartão que não seja maquininha é link. */
export function meioVD(p: string | null | undefined): MeioVD {
  if (p === "pix") return "pix";
  if (p === "cartao_maquininha") return "cartao_maquininha";
  return "cartao";
}
