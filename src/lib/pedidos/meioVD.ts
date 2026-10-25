/** Meios de pagamento da Venda Direta (código da regra de pagamento do pedido). */
export type MeioVD = "pix" | "cartao" | "cartao_maquininha";

export const ROTULO_MEIO_VD: Record<MeioVD, string> = {
  pix: "PIX",
  cartao: "Cartão (link)",
  cartao_maquininha: "Cartão maquininha",
};

/** Normaliza o pagamento vindo do banco; qualquer cartão que não seja maquininha é link. */
export function meioVD(p: string | null | undefined): MeioVD {
  if (p === "pix") return "pix";
  if (p === "cartao_maquininha") return "cartao_maquininha";
  return "cartao";
}
