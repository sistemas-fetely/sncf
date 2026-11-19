export const pagamentoSocioDisponivel = (regime: boolean | null | undefined) => regime === true;
export function precoItemSocio(varejo: number, promocional?: number | null): number {
  return Math.round((promocional ?? varejo) * 0.75 * 100) / 100;
}