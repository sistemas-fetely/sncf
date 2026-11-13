/** Meio gravado em pagamento_link (13/11/2026 PIX-SAFRA-LINK). */
export type MeioPagamentoLink = "cartao_link" | "pix_link" | "pix";

/** Rótulo do link na tela: pix_link = PIX pelo Safra (link); pix = PIX legado (cobrança direta). */
export function rotuloMeioLink(meio: string | null | undefined): string {
  if (meio === "pix_link") return "PIX pelo Safra";
  if (meio === "pix") return "PIX";
  return "Cartão";
}
