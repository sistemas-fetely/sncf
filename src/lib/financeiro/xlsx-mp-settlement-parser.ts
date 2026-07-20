/**
 * Parser XLSX Mercado Pago — Settlement v2.
 * Cada linha = 1 transação aprovada com MDR real.
 * Coluna [19] CÓDIGO DE REFERÊNCIA = token Shopify (external_reference).
 * Coluna [11] DATA DE LIBERAÇÃO DO DINHEIRO = quando o dinheiro ficou disponível.
 * Coluna [12] MEIO DE PAGAMENTO = Pix | Mastercard | Visa | etc.
 */

import * as XLSX from "xlsx";

export interface MpSettlementTransacao {
  data_aprovacao: string;       // ISO
  data_liberacao: string;       // ISO — quando ficou disponível no MP
  id_transacao_mp: string;
  tipo_meio_pagamento: string;  // Transferência bancária | Cartão de crédito
  meio_pagamento: string;       // Pix | Mastercard | Visa | etc.
  valor_bruto: number;
  tarifa: number;               // MDR real (negativo no arquivo → guardar positivo)
  valor_liquido: number;
  codigo_referencia: string;    // token Shopify
  parcelas: number;
  origem: "mp_settlement";
}

export interface MpSettlementParsed {
  transacoes: MpSettlementTransacao[];
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

export function parseXlsxMpSettlement(buf: ArrayBuffer): MpSettlementParsed {
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  if (rows.length < 2) return { transacoes: [] };

  const header = (rows[0] as unknown[]).map(norm);
  const idx = (key: string) => header.findIndex(h => h.includes(norm(key)));

  const iDataAprov  = idx("data de aprovacao");
  const iDataLib    = idx("data de liberacao do dinheiro");
  const iIdTrans    = idx("id da transacao no mercado pago");
  const iTipoMeio   = idx("tipo de meio de pagamento");
  const iMeio       = idx("meio de pagamento");
  const iValorBruto = idx("valor da compra");
  const iTarifa     = idx("tarifas");
  const iValorLiq   = idx("valor liquido da transacao");
  const iCodRef     = idx("codigo de referencia");
  const iParcelas   = idx("parcelas");

  const transacoes: MpSettlementTransacao[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row || !row[iIdTrans]) continue;

    transacoes.push({
      data_aprovacao:      toISO(row[iDataAprov]),
      data_liberacao:      toISO(row[iDataLib]),
      id_transacao_mp:     String(row[iIdTrans] ?? ""),
      tipo_meio_pagamento: String(row[iTipoMeio] ?? ""),
      meio_pagamento:      String(row[iMeio] ?? ""),
      valor_bruto:         toNum(row[iValorBruto]),
      tarifa:              Math.abs(toNum(row[iTarifa])),
      valor_liquido:       toNum(row[iValorLiq]),
      codigo_referencia:   String(row[iCodRef] ?? ""),
      parcelas:            parseInt(String(row[iParcelas] ?? "1"), 10) || 1,
      origem:              "mp_settlement",
    });
  }

  return { transacoes };
}
