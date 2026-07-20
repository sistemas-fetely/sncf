/**
 * Parser XLSX Mercado Pago — Reserve and Release.
 * É o "OFX do MP" — extrato corrido com saldo.
 * TIPO DE REGISTRO: "Liberações" (crédito) | "Retiradas" (débito = Withdraw já processado pelo P2)
 * Para a conciliação, importar só as "Liberações" como créditos da conta MP.
 * As "Retiradas" são ignoradas aqui — já entram via xlsx-mp-withdraw-parser.
 */

import * as XLSX from "xlsx";

export interface MpLiberacao {
  data_liberacao: string;     // ISO
  id_operacao: string;
  descricao: string;
  valor_liquido: number;      // sempre positivo (crédito)
  meio_pagamento: string;
  codigo_referencia: string;  // token Shopify
  saldo_apos: number;
  origem: "mp_reserve_release";
}

export interface MpReserveReleaseParsed {
  liberacoes: MpLiberacao[];
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function toISO(v: unknown): string {
  if (!v) return "";
  const s = String(v);
  const m = s.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function toNum(v: unknown): number {
  return parseFloat(String(v ?? "0").replace(",", ".")) || 0;
}

export function parseXlsxMpReserveRelease(buf: ArrayBuffer): MpReserveReleaseParsed {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  if (rows.length < 2) return { liberacoes: [] };

  const header = (rows[0] as unknown[]).map(norm);
  const idx = (key: string) => header.findIndex(h => h.includes(norm(key)));

  const iDataLib   = idx("data de liberacao");
  const iIdOp      = idx("id da operacao");
  const iDescricao = idx("descricao");
  const iCredito   = idx("valor liquido creditado");
  const iMeio      = idx("meio de pagamento");
  const iCodRef    = idx("codigo de referencia");
  const iSaldo     = idx("saldo");
  const iTipoReg   = idx("tipo de registro");

  const liberacoes: MpLiberacao[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;

    const tipoReg = norm(row[iTipoReg]);
    if (!tipoReg.includes("libera")) continue;

    const credito = toNum(row[iCredito]);
    if (credito <= 0) continue;

    liberacoes.push({
      data_liberacao:   toISO(row[iDataLib]),
      id_operacao:      String(row[iIdOp] ?? ""),
      descricao:        String(row[iDescricao] ?? ""),
      valor_liquido:    credito,
      meio_pagamento:   String(row[iMeio] ?? ""),
      codigo_referencia: String(row[iCodRef] ?? ""),
      saldo_apos:       toNum(row[iSaldo]),
      origem:           "mp_reserve_release",
    });
  }

  return { liberacoes };
}
