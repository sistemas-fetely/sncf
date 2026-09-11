/**
 * Chave de NF-e referenciada (grupo NFref/refNFe) — normalização + alarme.
 *
 * Caso real (NF 26133 série 10 da UTILPLAST, CNPJ 43367390000498, 10/09/2026):
 * devolução com 241 itens CFOP 6918 entrou em `nfs_stage` com `fin_nfe = 4` e
 * `nf_referenciada_chave = NULL`. Sem a chave, `fn_devolucao_sugerir_vinculos` não
 * tem o que casar. Regra: só dígitos, exatamente 44; tamanho diferente NÃO grava.
 */

export function normalizarChaveNfe(
  bruto: unknown,
  ctx: { numero?: string | null; fonte?: string },
): string | null {
  if (bruto == null) return null;
  const digitos = String(bruto).replace(/\D/g, "");
  if (digitos === "") return null;
  if (digitos.length !== 44) {
    console.error(
      `[chave-nfe] chave referenciada RECUSADA (${digitos.length} dígitos, esperado 44) ` +
        `— nota ${ctx.numero ?? "?"}, fonte ${ctx.fonte ?? "?"}, valor bruto: ${String(bruto).slice(0, 80)}`,
    );
    return null;
  }
  return digitos;
}

/** FAIL-LOUD: devolução sem nota referenciada é documento incompleto. Não bloqueia. */
export function alertarDevolucaoSemReferencia(ctx: {
  fin_nfe: number | null | undefined;
  chave_referenciada: string | null | undefined;
  numero?: string | null;
  serie?: string | null;
  cnpj_emitente?: string | null;
  fonte: string;
}): void {
  if (Number(ctx.fin_nfe) !== 4) return;
  if (ctx.chave_referenciada) return;
  console.error(
    "[chave-nfe] ANOMALIA: devolução (finNFe=4) sem nota referenciada — " +
      `numero=${ctx.numero ?? "?"} serie=${ctx.serie ?? "?"} ` +
      `cnpj_emitente=${ctx.cnpj_emitente ?? "?"} fonte=${ctx.fonte}. ` +
      "Sem refNFe o vínculo fiscal terá de ser feito à mão.",
  );
}
