// RASTREIO-DV-SRO (28/10/2026): espelho de public.fn_sro_codigo_valido no banco.
// Formato AA123456789AA + dígito verificador SRO (pesos 8,6,4,2,3,5,9,7 · mod 11).

export const FORMATO_SRO = /^[A-Z]{2}\d{9}[A-Z]{2}$/;

export function normalizarSro(v: string): string {
  return (v ?? "").replace(/\s/g, "").toUpperCase();
}

const PESOS = [8, 6, 4, 2, 3, 5, 9, 7];

export function sroDigitoConfere(codigo: string): boolean {
  const v = normalizarSro(codigo);
  if (!FORMATO_SRO.test(v)) return false;
  const soma = PESOS.reduce((s, p, i) => s + Number(v[2 + i]) * p, 0);
  const r = soma % 11;
  const dv = r === 0 ? 5 : r === 1 ? 0 : 11 - r;
  return Number(v[10]) === dv;
}

/** null = válido; senão a mensagem curta para exibir sob o campo. */
export function erroCodigoSro(codigo: string): string | null {
  const v = normalizarSro(codigo);
  if (!FORMATO_SRO.test(v)) return "Formato AA123456789BR";
  if (!sroDigitoConfere(v)) return "Dígito de controle não confere";
  return null;
}
