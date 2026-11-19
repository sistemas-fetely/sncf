/** Link PIX usa a primeira transação da charge paga, mesmo com enums numéricos 8.
 * Não modifica a seleção de transação aprovada usada pelo cartão. */
export function provaPixLink(charges: { chargeStatus?: unknown; status?: unknown; nsu?: unknown; transactions?: { endToEndId?: unknown; transactionId?: unknown }[] }[]): string | null {
  const charge = charges.find((c) => Number(c.chargeStatus ?? c.status) === 1);
  const tx = charge?.transactions?.[0];
  const ref = [tx?.endToEndId, tx?.transactionId, charge?.nsu].find((v) => v !== null && v !== undefined && v !== "");
  return ref == null ? null : String(ref);
}
export function alertaPreAutorizacao(linkPix: boolean, temPre: boolean): boolean { return temPre && !linkPix; }
export function estadoAguardandoLink(linkPix: boolean): { erro?: null } { return linkPix ? { erro: null } : {}; }