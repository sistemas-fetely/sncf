export interface SaldoOrigemTi {
  sku: string | null;
  fiscal_sadio: number | string | null;
}

/** O aviso usa o saldo fiscal sadio com sinal, nunca o disponível truncado. */
export function saldosNegativosTi(saldos: readonly SaldoOrigemTi[]) {
  return saldos.flatMap(({ sku, fiscal_sadio }) => {
    const saldo = Number(fiscal_sadio);
    return sku && fiscal_sadio != null && Number.isFinite(saldo) && saldo < 0
      ? [{ sku, saldo }]
      : [];
  });
}