/**
 * Parser XLSX Mercado Pago — Settlement. A regra mora em
 * `supabase/functions/_shared/financeiro/mp/settlement.ts` (versão única com a edge mp-relatorios).
 */
import * as XLSX from "xlsx";
import { normalizarMpSettlement, type MpSettlementTransacao } from "../../../supabase/functions/_shared/financeiro/mp/settlement.ts";

export type { MpSettlementTransacao };
export interface MpSettlementParsed { transacoes: MpSettlementTransacao[] }

export function parseXlsxMpSettlement(buf: ArrayBuffer): MpSettlementParsed {
  const wb = XLSX.read(buf, { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  return { transacoes: normalizarMpSettlement(rows) };
}
