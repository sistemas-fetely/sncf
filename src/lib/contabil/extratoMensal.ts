import * as XLSX from "xlsx";
import { parseOFX } from "@/lib/financeiro/ofx-parser";

export interface LeituraMensal {
  periodo_inicio: string | null; periodo_fim: string | null;
  saldo_inicial: number | null; saldo_final: number | null;
}
export function cobreMes(inicio: string | null, fim: string | null, competencia: string) {
  const primeiro = `${competencia.slice(0, 7)}-01`;
  const ultimo = new Date(Date.UTC(Number(primeiro.slice(0, 4)), Number(primeiro.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return !!inicio && !!fim && inicio <= primeiro && fim >= ultimo;
}
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}
function data(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}` : null; }
  const s = String(v ?? "");
  const m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0,10) : null;
}
export function lerAccountStatement(linhas: unknown[][]): LeituraMensal {
  const h = linhas.findIndex(r => r.includes("INITIAL_BALANCE") && r.includes("FINAL_BALANCE"));
  const t = linhas.findIndex(r => r.includes("RELEASE_DATE") && r.includes("PARTIAL_BALANCE") && r.includes("TRANSACTION_NET_AMOUNT"));
  if (h < 0 || t < 0) throw new Error("Cabeçalho Account Statement não reconhecido");
  const cab = linhas[h], valores = linhas[h+1] ?? [], col = linhas[t].indexOf("RELEASE_DATE");
  const datas = linhas.slice(t+1).map(r => data(r[col])).filter((d): d is string => !!d).sort();
  return { periodo_inicio: datas[0] ?? null, periodo_fim: datas.at(-1) ?? null,
    saldo_inicial: numero(valores[cab.indexOf("INITIAL_BALANCE")]), saldo_final: numero(valores[cab.indexOf("FINAL_BALANCE")]) };
}
export async function lerExtratoMensal(file: File, formato: "ofx" | "xlsx" | "pdf"): Promise<LeituraMensal> {
  if (formato === "pdf") return {periodo_inicio:null,periodo_fim:null,saldo_inicial:null,saldo_final:null};
  if (formato === "xlsx") {
    const wb = XLSX.read(await file.arrayBuffer(), {type:"array",cellDates:true});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("Planilha vazia");
    return lerAccountStatement(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:null}));
  }
  const text = await file.text();
  if (!/<OFX[>\s]/i.test(text)) throw new Error("Arquivo OFX não reconhecido");
  const parsed = parseOFX(text);
  const tagData = (tag: string) => { const m = new RegExp(`<${tag}>(\\d{4})(\\d{2})(\\d{2})`,"i").exec(text); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
  const fim = tagData("DTEND");
  const normalizarMemo = (memo: string) => memo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const ehSaldo = (memo: string) => memo.startsWith("SALDO ANTERIOR") || memo.includes("SALDO TOTAL DISPONIVEL");
  const soma = parsed.movimentacoes
    .filter(m => !ehSaldo(normalizarMemo(m.descricao)))
    .reduce((total, m) => total + m.valor, 0);
  let inicial: number | null = null;
  let final: number | null = null;
  let ultimaDataSaldo = "";
  for (const match of text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const bloco = match[1];
    const memo = normalizarMemo(/<MEMO>([^<\r\n]*)/i.exec(bloco)?.[1] ?? "");
    const valor = numero(/<TRNAMT>([^<\r\n]*)/i.exec(bloco)?.[1]);
    if (memo.startsWith("SALDO ANTERIOR") && inicial == null) inicial = valor;
    const posted = /<DTPOSTED>(\d{8}(?:\d{6})?)/i.exec(bloco)?.[1];
    const dia = posted ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` : null;
    // Maior DTPOSTED; em empate, prevalece a última linha do arquivo.
    const ordemData = posted?.padEnd(14, "0") ?? "";
    if (memo.includes("SALDO TOTAL DISPONIVEL") && valor != null && dia && fim && dia <= fim && ordemData >= ultimaDataSaldo) {
      final = valor;
      ultimaDataSaldo = ordemData;
    }
  }
  const arredondar = (valor: number) => Math.round(valor * 100) / 100;
  if (final == null && inicial != null) final = arredondar(inicial + soma);
  if (final == null && parsed.saldoData && fim && parsed.saldoData <= fim) final = parsed.saldo;
  if (inicial == null && final != null) inicial = arredondar(final - soma);
  return { periodo_inicio: tagData("DTSTART"), periodo_fim: fim, saldo_inicial: inicial, saldo_final: final };
}