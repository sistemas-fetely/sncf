/** Validates a min/ceiling edit; null fields keep the current value (bulk only). Returns an error message or null. */
export function validarMinTeto(minimo: number | null, teto: number | null, opts: { exigirAmbos?: boolean } = {}): string | null {
  if (opts.exigirAmbos && (minimo == null || teto == null)) return "Informe mínimo e teto.";
  if (minimo == null && teto == null) return "Informe mínimo ou teto.";
  if ((minimo != null && (!Number.isFinite(minimo) || minimo < 0)) || (teto != null && (!Number.isFinite(teto) || teto < 0))) return "Valores devem ser ≥ 0.";
  if (minimo != null && teto != null && teto < minimo) return "Teto deve ser maior ou igual ao mínimo.";
  return null;
}
export const numeroOuNulo = (v: string) => v.trim() === "" ? null : Number(v.replace(",", "."));
