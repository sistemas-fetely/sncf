/** Regra única de "com diferença" na Conciliação de Estoque (por centro). Contagem vencida/nunca contado não é diferença. */
export type LinhaDiferenca = {
  real: number | null; fiscal: number | null; delta_virtual_real: number | null;
  shopify_diff: number | null; bling_diff: number | null; nf_pendente: number | null;
  tem_baixa_pendente: boolean | null; causas: { regra: string }[] | null;
};

export const REGRA_CONTAGEM_VENCIDA = "estoque_contagem_vencida";
const n0 = (v: number | null | undefined) => Number(v ?? 0);

export function temDiferenca(c: LinhaDiferenca): boolean {
  return (c.real !== null && c.real !== undefined && n0(c.real) !== n0(c.fiscal))
    || n0(c.delta_virtual_real) !== 0
    || n0(c.shopify_diff) !== 0 || n0(c.bling_diff) !== 0
    || (c.nf_pendente !== null && c.nf_pendente !== undefined && n0(c.nf_pendente) !== 0)
    || !!c.tem_baixa_pendente
    || (c.causas ?? []).some(x => x.regra !== REGRA_CONTAGEM_VENCIDA);
}

/** Sem contagem válida: nunca contado com fiscal ≠ 0, ou contagem vencida. */
export function semContagemValida(c: { fonte_real: string | null; fiscal: number | null; contagem_vencida: boolean | null }): boolean {
  return (c.fonte_real === "sem_contagem" && n0(c.fiscal) !== 0) || !!c.contagem_vencida;
}
