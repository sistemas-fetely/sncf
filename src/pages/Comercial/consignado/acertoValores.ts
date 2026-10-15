// Regra do acerto de consignado: o que de fato se paga ao parceiro é o bruto do
// vendido menos os abatimentos (devoluções lançadas no próprio acerto).
// Fonte: consignado_acerto.valor_total e consignado_acerto.valor_abatimento.
export interface AcertoComAbatimento {
  valor_total: number | null;
  valor_abatimento?: number | null;
}

/** Valor a pagar do acerto, arredondado em centavos. */
export function valorAPagarAcerto(acerto: AcertoComAbatimento): number {
  const bruto = Number(acerto.valor_total ?? 0);
  const abatimento = Number(acerto.valor_abatimento ?? 0);
  return Math.round((bruto - abatimento) * 100) / 100;
}

/** Há abatimento a exibir? */
export function temAbatimentoAcerto(acerto: AcertoComAbatimento): boolean {
  return Number(acerto.valor_abatimento ?? 0) > 0;
}
