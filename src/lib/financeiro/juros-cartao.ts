// 21/10/2026 (Flavio): o SNCF calcula os juros do parcelamento no cartão e soma ao valor do link.
// A mesma conta roda no banco (renegociar_titulo_cartao); aqui é só a prévia do modal.
export type JurosPor = "cliente" | "fetely";

export interface ContaJurosCartao {
  principal: number;
  juros: number;
  total: number;
  /** Juros por conta do cliente sem taxa cadastrada para N parcelas. */
  semTaxa: boolean;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcularJurosCartao(principal: number, taxaPercentual: number | null | undefined, jurosPor: JurosPor): ContaJurosCartao {
  const p = r2(principal);
  if (jurosPor === "fetely") return { principal: p, juros: 0, total: p, semTaxa: false };
  if (taxaPercentual == null) return { principal: p, juros: 0, total: p, semTaxa: true };
  const juros = r2((p * taxaPercentual) / 100);
  return { principal: p, juros, total: r2(p + juros), semTaxa: false };
}
