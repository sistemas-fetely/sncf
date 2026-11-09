// Block order/labels of the product field matrix, shared by the spreadsheet export and the daily review.
export const ORDEM_BLOCO = ["identidade", "fiscal_fisico", "classificacao", "comercial"];

export const legivel = (s: string | null | undefined) => {
  if (!s) return "";
  const t = s.replace(/_/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const posicaoBloco = (b: string) => { const i = ORDEM_BLOCO.indexOf(b); return i < 0 ? 100 : i; };
