/**
 * Filtro de meio de pagamento da Auditoria Financeira.
 *
 * Doutrina: `meio_pagamento` é um rótulo COLAPSADO (pedido com boleto + cartão
 * vira 'misto'). Por isso ele serve para EXIBIR, nunca para filtrar. O filtro
 * usa as flags booleanas do grão do título (`tem_cartao`, `tem_boleto`,
 * `tem_pix`, `tem_haver`), que não colapsam.
 *
 * Consequência esperada: um achado misto aparece em mais de um chip, então a
 * soma dos chips é maior que o total de achados. Isso é a realidade, não bug.
 */

export type AchadoMeioFlags = {
  tem_cartao?: boolean | null;
  tem_boleto?: boolean | null;
  tem_pix?: boolean | null;
  tem_haver?: boolean | null;
};

export const MEIO_TODOS = "todos";

/** Ordem de exibição dos chips. */
export const MEIO_ORDEM = ["cartao", "pix", "boleto", "misto", "haver", "sem_titulo"];

export const MEIO_LABEL: Record<string, string> = {
  boleto: "Boleto",
  pix: "PIX",
  cartao: "Cartão",
  haver: "Haver",
  misto: "Misto",
  sem_titulo: "Sem título",
};

export const labelMeio = (m: string | null | undefined) =>
  (m && MEIO_LABEL[m]) || m || "—";

/** Quantas flags de meio estão verdadeiras neste achado. */
export function qtdMeios(a: AchadoMeioFlags): number {
  return (
    (a.tem_cartao ? 1 : 0) +
    (a.tem_boleto ? 1 : 0) +
    (a.tem_pix ? 1 : 0) +
    (a.tem_haver ? 1 : 0)
  );
}

/** O achado se encaixa no chip `meio`? */
export function achadoTemMeio(a: AchadoMeioFlags, meio: string): boolean {
  if (meio === MEIO_TODOS) return true;
  switch (meio) {
    case "cartao":
      return a.tem_cartao === true;
    case "boleto":
      return a.tem_boleto === true;
    case "pix":
      return a.tem_pix === true;
    case "haver":
      return a.tem_haver === true;
    case "misto":
      return qtdMeios(a) > 1;
    case "sem_titulo":
      return qtdMeios(a) === 0;
    default:
      return false;
  }
}

/**
 * Chips presentes no lote (universo) na ordem canônica.
 * Só entram os chips que existem em pelo menos um achado do lote.
 */
export function meiosNoLote<T extends AchadoMeioFlags>(lote: T[]): string[] {
  return MEIO_ORDEM.filter((m) => lote.some((a) => achadoTemMeio(a, m)));
}

/** Contagem por chip dentro de um recorte já filtrado pelos outros filtros. */
export function contarMeios<T extends AchadoMeioFlags>(
  recorte: T[],
  universo: string[]
): [string, number][] {
  return universo.map(
    (m) => [m, recorte.filter((a) => achadoTemMeio(a, m)).length] as [string, number]
  );
}
