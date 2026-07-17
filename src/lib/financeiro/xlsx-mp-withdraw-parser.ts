/**
 * Parser XLSX/CSV — Saques do Mercado Pago (Withdrawals).
 *
 * Layout: primeira linha = cabeçalho, colunas variam por locale.
 * Reconhecemos: número da retirada (id/withdraw), data (criação/liberação), valor, banco/conta destino.
 * Saque é sempre débito na conta MP → contraparte = própria Fetely.
 */

import * as XLSX from "xlsx";

export interface MovimentacaoMpWithdraw {
  data_transacao: string | null;
  tipo: "debito";
  valor: number;
  descricao: string;
  contraparte_nome: string;
  contraparte_documento: string;
  tipo_meio: "transferencia";
  origem: "mp_withdraw";
  id_transacao_banco: string;
  hash_unico: string;
}

export interface MpWithdrawParsed {
  movimentacoes: MovimentacaoMpWithdraw[];
  header: string[];
}

const FETELY_NOME = "FETELY COMERCIO IMPORTACAO E EXPORTACAO LTDA";
const FETELY_DOC = "63591078000148";

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function acharColuna(header: string[], candidatos: string[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    if (candidatos.some((c) => h.includes(c))) return i;
  }
  return -1;
}

function parseData(v: unknown): string | null {
  if (v == null || v === "") return null;
  // Excel date serial
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${d.y}-${mm}-${dd}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
  // yyyy-mm-dd
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return null;
}

function parseValor(v: unknown): number {
  if (typeof v === "number") return Math.abs(v);
  const s = String(v ?? "").replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  // BR: "1.234,56" ou "1234,56"
  const brFmt = s.includes(",");
  const norm = brFmt ? s.replace(/\./g, "").replace(",", ".") : s;
  return Math.abs(parseFloat(norm) || 0);
}

export function isXlsxMpWithdraw(header: string[]): boolean {
  const hs = header.map(norm).join("|");
  return /retirad|withdraw/.test(hs);
}

export function parseXlsxMpWithdraw(buf: ArrayBuffer): MpWithdrawParsed {
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
  }) as unknown[][];
  if (rows.length === 0) return { movimentacoes: [], header: [] };

  // Header = primeira linha não vazia
  let headerIdx = 0;
  while (headerIdx < rows.length && (rows[headerIdx] || []).every((c) => c == null || c === "")) {
    headerIdx++;
  }
  const header = (rows[headerIdx] || []).map((c) => String(c ?? ""));

  const idxNumero = acharColuna(header, ["numero da retirad", "n retirad", "id da retirad", "withdraw id", "id retirad", "numero retirad"]);
  const idxData = acharColuna(header, ["data de criac", "data de liberac", "data da retirad", "data liberac", "created_date", "release_date", "data"]);
  const idxValor = acharColuna(header, ["valor da retirad", "valor retirad", "amount", "valor"]);
  const idxBanco = acharColuna(header, ["banco", "bank"]);
  const idxConta = acharColuna(header, ["conta destin", "account destin", "conta"]);

  if (idxData < 0 || idxValor < 0) {
    throw new Error("Planilha de saques MP: colunas de data/valor não localizadas");
  }

  const movs: MovimentacaoMpWithdraw[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every((c) => c == null || c === "")) continue;

    const data = parseData(row[idxData]);
    const valor = parseValor(row[idxValor]);
    if (!data || !valor) continue;

    const numero = idxNumero >= 0 ? String(row[idxNumero] ?? "").trim() : "";
    const banco = idxBanco >= 0 ? String(row[idxBanco] ?? "").trim() : "";
    const conta = idxConta >= 0 ? String(row[idxConta] ?? "").trim() : "";
    const destino = [banco, conta].filter(Boolean).join(" ");
    const descricao = destino ? `SAQUE MP -> ${destino}` : "SAQUE MERCADO PAGO";

    // Chave nativa: idempotente pelo número da retirada
    const idKey = numero || `${data}_${valor.toFixed(2)}`;
    const hash = `mpw:${idKey}`;

    movs.push({
      data_transacao: data,
      tipo: "debito",
      valor,
      descricao,
      contraparte_nome: FETELY_NOME,
      contraparte_documento: FETELY_DOC,
      tipo_meio: "transferencia",
      origem: "mp_withdraw",
      id_transacao_banco: idKey,
      hash_unico: hash,
    });
  }

  return { movimentacoes: movs, header };
}
