/**
 * Parser XLSX Mercado Pago — Reserve and Release. A regra mora em
 * `supabase/functions/_shared/financeiro/mp/release.ts` (versão única com a edge mp-relatorios).
 */
import * as XLSX from "xlsx";
import { normalizarMpRelease, type MpLiberacao } from "../../../supabase/functions/_shared/financeiro/mp/release.ts";

export type { MpLiberacao };
export interface MpReserveReleaseParsed { liberacoes: MpLiberacao[] }

export function parseXlsxMpReserveRelease(buf: ArrayBuffer): MpReserveReleaseParsed {
  const wb = XLSX.read(buf, { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  return { liberacoes: normalizarMpRelease(rows) };
}
