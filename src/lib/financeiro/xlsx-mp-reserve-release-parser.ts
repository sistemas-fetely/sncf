/**
 * Parser XLSX Mercado Pago — Reserve and Release.
 * É o "OFX do MP" — extrato corrido com saldo.
 * Tudo que é dinheiro vem com TIPO DE REGISTRO = "Liberações".
 * O que separa entrada de saída NÃO é o tipo de registro: é a coluna
 * VALOR LÍQUIDO DEBITADO (saque, devolução) contra VALOR LÍQUIDO CREDITADO
 * (pagamento). Por isso o valor de cada linha sai assinado (credito - debito).
 * Linhas de DESCRIÇÃO começando com "Reserva" são par neutro (o mesmo valor
 * aparece creditado numa linha e debitado noutra) — trânsito interno do MP,
 * não é dinheiro, não entra.
 * Linhas de "Saldo inicial disponível" e "Total" são cabeçalho/rodapé e ficam
 * de fora pelo filtro de "Liberações".
 */

import * as XLSX from "xlsx";

export interface MpLiberacao {
  data_liberacao: string;     // ISO
  id_operacao: string;
  descricao: string;
  valor_liquido: number;      // assinado: crédito positivo, débito negativo
  meio_pagamento: string;
  codigo_referencia: string;  // token Shopify
  saldo_apos: number;
  descricao_mp: string;       // conteúdo bruto da coluna DESCRIÇÃO
  conta_destino: string;      // CONTA DE DESTINO DA RETIRADA
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
  const iDebito    = idx("valor liquido debitado");
  const iMeio      = idx("meio de pagamento");
  const iCodRef    = idx("codigo de referencia");
  const iSaldo     = idx("saldo");
  const iTipoReg   = idx("tipo de registro");
  const iContaDest = idx("conta de destino da retirada");

  const liberacoes: MpLiberacao[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    if (!row) continue;

    const tipoReg = norm(row[iTipoReg]);
    if (!tipoReg.includes("libera")) continue;

    const descricaoBruta = String(row[iDescricao] ?? "");
    // Perna de reserva é par neutro (crédito + débito do mesmo valor): não é dinheiro.
    if (norm(descricaoBruta).startsWith("reserva")) continue;

    const credito = toNum(row[iCredito]);
    const debito = toNum(row[iDebito]);
    const valor = credito - debito;
    if (valor === 0) continue;

    liberacoes.push({
      data_liberacao:   toISO(row[iDataLib]),
      id_operacao:      String(row[iIdOp] ?? ""),
      descricao:        descricaoBruta,
      valor_liquido:    valor,
      meio_pagamento:   String(row[iMeio] ?? ""),
      codigo_referencia: String(row[iCodRef] ?? ""),
      saldo_apos:       toNum(row[iSaldo]),
      descricao_mp:     descricaoBruta,
      conta_destino:    String(row[iContaDest] ?? ""),
      origem:           "mp_reserve_release",
    });
  }

  return { liberacoes };
}
