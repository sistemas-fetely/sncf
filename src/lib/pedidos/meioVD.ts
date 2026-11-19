/** Meios de pagamento da Venda Direta (código da regra de pagamento do pedido). */
/** pix = QR local na chave da Fetely; pix_safra = link PIX Safrapay (13/11/2026). */
export type MeioVD = "pix" | "pix_safra" | "cartao" | "cartao_maquininha";

export const ROTULO_MEIO_VD: Record<MeioVD, string> = {
  pix: "PIX na hora (QR)",
  pix_safra: "Link PIX Safra (confirma sozinho)",
  cartao: "Cartão (link)",
  cartao_maquininha: "Cartão maquininha",
};

/** Pagamento escolhido no Novo pedido: meio de cobrança ou bonificação (sem cobrança). */
export type PagamentoVD = MeioVD | "bonificacao" | "conta_corrente_socio";

/** Escolhas novas da VD; a leitura de pedidos antigos continua aceitando pix. */
export const MEIOS_SELECIONAVEIS_VD: MeioVD[] = ["pix_safra", "cartao", "cartao_maquininha"];
export function meioSelecionavelVD(p: string | null | undefined): MeioVD {
  const meio = meioVD(p);
  return meio === "pix" ? "pix_safra" : meio;
}

/** Bonificação (27/10/2026): pedido sem cobrança — não conta como aguardando pagamento. */
export const ehBonificacao = (p: string | null | undefined) => p === "bonificacao";

/** Rótulo para exibição de qualquer pagamento da VD, inclusive bonificação. */
export function rotuloPagamentoVD(p: string | null | undefined): string {
  if (p === "conta_corrente_socio") return "Conta corrente sócio";
  return ehBonificacao(p) ? "Bonificação" : ROTULO_MEIO_VD[meioVD(p)];
}

/** Normaliza o pagamento vindo do banco; qualquer cartão que não seja maquininha é link. */
export function meioVD(p: string | null | undefined): MeioVD {
  if (p === "pix") return "pix";
  if (p === "pix_safra") return "pix_safra";
  if (p === "cartao_maquininha") return "cartao_maquininha";
  return "cartao";
}
