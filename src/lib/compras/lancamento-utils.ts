// Utilidades compartilhadas dos lançamentos de compra de mercadoria.

// Verde do módulo de compras (botões primários).
export const VERDE = "#1A4A3A";

/** Vírgula é decimal; ponto é separador de milhar. Nunca separador de coluna. */
export function parsearNumero(s: string): number {
  const t = String(s ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return isNaN(n) ? NaN : n;
}

export function fmtMoeda(v: number | null | undefined, moeda?: string | null) {
  const code = (moeda || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(
      Number(v ?? 0),
    );
  } catch {
    return `${code} ${Number(v ?? 0).toFixed(2)}`;
  }
}
