export type LinhaAuditoria = {
  auditoria_status?: string | null;
  auditoria_diferenca?: number | null;
  valor_frete?: number | null;
};

export type ResumoContestacao = {
  acimaQtd: number;
  acimaExcedente: number;
  justificarQtd: number;
  justificarValor: number;
};

const cent = (v: number | null | undefined) => Math.round((v ?? 0) * 100);

/** Acima da tabela = excedente sobre a referência; a justificar = valor cobrado. */
export function resumirContestacao(linhas: LinhaAuditoria[]): ResumoContestacao {
  let acimaQtd = 0, acimaC = 0, justificarQtd = 0, justC = 0;
  for (const l of linhas) {
    if (l.auditoria_status === "acima_referencia") { acimaQtd++; acimaC += cent(l.auditoria_diferenca); }
    else if (l.auditoria_status === "justificar") { justificarQtd++; justC += cent(l.valor_frete); }
  }
  return { acimaQtd, acimaExcedente: acimaC / 100, justificarQtd, justificarValor: justC / 100 };
}

export function temAlgoAContestar(r: ResumoContestacao): boolean {
  return r.acimaQtd > 0 || r.justificarQtd > 0;
}
