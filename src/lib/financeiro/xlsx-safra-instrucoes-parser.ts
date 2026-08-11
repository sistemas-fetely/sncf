/**
 * Parser — Safra "Recebimentos - Instruções 2ª via" (.xlsx)
 *
 * Papel: CONFERÊNCIA. Este relatório não vira movimentação bancária e não dá
 * baixa em título. Ele só alimenta `safra_carteira_conferencia`.
 *
 * Estrutura esperada:
 *  - linha 1 (índice 0): nome da empresa + data de geração ("11/08/2026 08:45")
 *  - linha 4 (índice 3): título "Recebimentos - Instruções ..."
 *  - linha 6 (índice 5): cabeçalho da tabela
 */
import * as XLSX from "xlsx";
import { temTitulo, textoPrimeirasLinhas } from "./xlsx-titulo";

const RE_INSTRUCOES = /recebimentos\s*-\s*instrucoes/;


export const CABECALHO_INSTRUCOES_ESPERADO =
  "Data Vencimento | Data Pagamento | Nº Operação | Nº Documento | Nosso Nº | Pagador | " +
  "Forma envio | Status | Valor Boleto (R$) | Valor Recebido (R$) | Diferença (R$) | Situação";

export type SafraInstrucaoLinha = {
  nosso_numero: string;
  numero_documento_truncado: string | null;
  pagador: string | null;
  data_vencimento: string | null;
  data_pagamento: string | null;
  valor_boleto: number;
  valor_recebido: number;
  diferenca: number;
  situacao: string | null;
  forma_envio: string | null;
};

export type SafraInstrucoesParsed = {
  data_referencia: string;
  data_referencia_inferida: boolean;
  linhas: SafraInstrucaoLinha[];
};

function normalizar(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function lerRows(buf: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null }) as unknown[][];
}

export function ehSafraInstrucoes2Via(buf: ArrayBuffer): boolean {
  const rows = lerRows(buf);
  const alvo = (rows[3] || []).map(normalizar).join(" | ");
  return alvo.includes("recebimentos - instrucoes");
}

/** Valor em formato brasileiro: "1.458,38" → 1458.38 */
function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  if (!s || s === "-") return 0;
  const negativo = /^\(.*\)$/.test(s);
  const limpo = s.replace(/[()]/g, "");
  const tem = { virgula: limpo.includes(","), ponto: limpo.includes(".") };
  const n = tem.virgula
    ? parseFloat(limpo.replace(/\./g, "").replace(",", "."))
    : parseFloat(limpo);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

function arred2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** dd/mm/yyyy (com hora opcional) ou Date do Excel → ISO yyyy-mm-dd */
function dataISO(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s || s === "-" || s === "0") return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/** Texto cru, sem formatar — Nosso Nº não pode perder zero à esquerda */
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function parseXlsxSafraInstrucoes2Via(buf: ArrayBuffer): SafraInstrucoesParsed {
  const rows = lerRows(buf);

  const titulo = (rows[3] || []).map(normalizar).join(" | ");
  if (!titulo.includes("recebimentos - instrucoes")) {
    throw new Error(
      "Arquivo não é o relatório Safra 'Recebimentos - Instruções 2ª via'. " +
        `Esperado na linha 4 o título 'Recebimentos - Instruções' e na linha 6 o cabeçalho: ${CABECALHO_INSTRUCOES_ESPERADO}`
    );
  }

  const header = (rows[5] || []).map(normalizar);
  const idx = (rotulo: string) => header.findIndex((h) => h === normalizar(rotulo));
  const cols = {
    vencimento: idx("Data Vencimento"),
    pagamento: idx("Data Pagamento"),
    documento: idx("Nº Documento"),
    nossoNumero: idx("Nosso Nº"),
    pagador: idx("Pagador"),
    formaEnvio: idx("Forma envio"),
    valorBoleto: idx("Valor Boleto (R$)"),
    valorRecebido: idx("Valor Recebido (R$)"),
    diferenca: idx("Diferença (R$)"),
    situacao: idx("Situação"),
  };

  const faltando = Object.entries(cols)
    .filter(([, i]) => i < 0)
    .map(([k]) => k);
  if (faltando.length > 0) {
    throw new Error(
      `Cabeçalho na linha 6 não bate (colunas ausentes: ${faltando.join(", ")}). ` +
        `Esperado: ${CABECALHO_INSTRUCOES_ESPERADO}`
    );
  }

  // Data de geração: linha 1, ao lado do nome da empresa
  const primeiraLinha = (rows[0] || []).map((c) => String(c ?? "")).join(" ");
  let dataRef = dataISO(primeiraLinha);
  if (!dataRef) {
    for (const c of rows[0] || []) {
      dataRef = dataISO(c);
      if (dataRef) break;
    }
  }
  const inferida = !dataRef;
  const data_referencia = dataRef || hoje();

  const linhas: SafraInstrucaoLinha[] = [];
  for (let i = 6; i < rows.length; i++) {
    const r = rows[i] || [];
    const nossoNumero = txt(r[cols.nossoNumero]);
    if (!nossoNumero) continue;
    if (normalizar(nossoNumero).startsWith("total")) continue;

    const valorRecebido = arred2(num(r[cols.valorRecebido]));
    linhas.push({
      nosso_numero: nossoNumero,
      numero_documento_truncado: txt(r[cols.documento]),
      pagador: txt(r[cols.pagador]),
      data_vencimento: dataISO(r[cols.vencimento]),
      // ABERTO: Data Pagamento vazia → null, nunca data inválida
      data_pagamento: dataISO(r[cols.pagamento]),
      valor_boleto: arred2(num(r[cols.valorBoleto])),
      valor_recebido: valorRecebido,
      diferenca: arred2(num(r[cols.diferenca])),
      situacao: txt(r[cols.situacao]),
      forma_envio: txt(r[cols.formaEnvio]),
    });
  }

  return { data_referencia, data_referencia_inferida: inferida, linhas };
}
