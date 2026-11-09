import { decidirCorrecao, type LinhaCorrecao } from "./correcaoConciliacao";

/**
 * SKUs aplicáveis em lote na Conciliação: só com exatamente um centro no escopo e super_admin;
 * entra o produto cuja linha daquele centro dá "aplicar_contagem". Recebe o recorte inteiro (todas as páginas).
 */
export function skusAplicaveisLote(
  skus: string[], linhaDoCentro: (sku: string, centro: string) => LinhaCorrecao | undefined,
  escopo: string[], isSuperAdmin: boolean,
): string[] {
  if (!isSuperAdmin || escopo.length !== 1) return [];
  const centro = escopo[0];
  return [...new Set(skus)].filter(s => { const l = linhaDoCentro(s, centro); return !!l && decidirCorrecao(l, true) === "aplicar_contagem"; });
}

/** Inventário: botão "Aplicar estas diferenças" só com divergências e super_admin. */
export function podeAplicarDiferencas(divergencias: { diferenca: number }[] | undefined, isSuperAdmin: boolean): boolean {
  return isSuperAdmin && (divergencias ?? []).some(d => Number(d.diferenca) !== 0);
}

export function skusComDiferenca(divergencias: { sku: string; diferenca: number }[] | undefined): string[] {
  return [...new Set((divergencias ?? []).filter(d => Number(d.diferenca) !== 0).map(d => d.sku))];
}

/** Documento pré-preenchido a partir da data ISO da contagem. */
export function documentoContagem(dataISO: string): string {
  const [a, m, d] = dataISO.slice(0, 10).split("-");
  return `Contagem de ${d}/${m}/${a}`;
}
