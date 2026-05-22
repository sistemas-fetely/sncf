/**
 * Utilitários de CNPJ — máscara, limpeza e validação de DV.
 * Sem dependências externas. Usado em cadastro de fornecedor.
 */

/** Remove tudo que não é dígito. */
export function cleanCNPJ(value: string): string {
  return value.replace(/\D/g, "");
}

/** Formata para "00.000.000/0000-00" enquanto digita (suporta string parcial). */
export function formatCNPJ(value: string): string {
  const d = cleanCNPJ(value).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * Valida dígitos verificadores do CNPJ via módulo 11.
 * Rejeita CNPJs com todos os dígitos iguais.
 */
export function validateCNPJ(value: string): boolean {
  const cnpj = cleanCNPJ(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDV = (slice: string, weights: number[]): number => {
    const sum = slice
      .split("")
      .reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const dv1 = calcDV(cnpj.slice(0, 12), w1);
  if (dv1 !== Number(cnpj[12])) return false;
  const dv2 = calcDV(cnpj.slice(0, 13), w2);
  if (dv2 !== Number(cnpj[13])) return false;
  return true;
}
