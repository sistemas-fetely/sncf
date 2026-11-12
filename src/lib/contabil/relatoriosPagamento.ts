import type { TipoDespesa } from "./documentosDespesa";
export const tiposPagamentoDaConta = <T extends TipoDespesa>(tipos: T[], conta: string): T[] => tipos.filter(t => t.ativo && t.pasta === "pagamentos" && t.conta_bancaria_id === conta);
export function mesesRelatorioPagamento(agora: Date): string[] {
  const fim = agora.getUTCFullYear() * 12 + agora.getUTCMonth();
  const out: string[] = [];
  for (let n = fim; n >= 2025 * 12 + 10; n--) out.push(`${Math.floor(n / 12)}-${String(n % 12 + 1).padStart(2, "0")}-01`);
  return out;
}
