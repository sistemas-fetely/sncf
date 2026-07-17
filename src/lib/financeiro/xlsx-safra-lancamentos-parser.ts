/**
 * Parser XLSX Safra — Lançamentos e Devoluções (aba principal).
 *
 * O arquivo tem cabeçalho institucional nas primeiras linhas.
 * Localizamos a linha real de header por keywords tolerantes a acento/caixa.
 */

import * as XLSX from "xlsx";

export interface MovimentacaoSafraLanc {
  data_transacao: string | null;
  data_hora: string | null;
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  referencia_pedido: string | null;
  tipo_meio: "pix";
  origem: "safra_lancamentos";
  id_transacao_banco: string | null; // E2E
}

export interface SafraLancParsed {
  movimentacoes: MovimentacaoSafraLanc[];
  cabecalhoDetectado: boolean;
  cabecalhoLidoRaw: string[];
}

const KEYS = {
  data: ["data e hora", "data/hora", "data"],
  status: ["status"],
  origem: ["origem"],
  pagador: [
    "dados do pagador",
    "nome do pagador",
    "pagador",
    "dados do recebedor",
    "nome do recebedor",
    "recebedor",
  ],
  doc: ["cpf/cnpj", "cnpj/cpf", "cpf", "cnpj"],
  id: ["id da transacao", "id da transação", "id transacao", "id transação", "e2e"],
  identificador: ["identificador"],
  valor: ["valor (r$)", "valor"],
};

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function acharColuna(row: unknown[], keys: string[]): number {
  for (let i = 0; i < row.length; i++) {
    const c = norm(row[i]);
    for (const k of keys) {
      if (c === k || c.includes(k)) return i;
    }
  }
  return -1;
}

function parseData(raw: unknown): { data: string | null; dataHora: string | null } {
  if (raw == null) return { data: null, dataHora: null };
  if (raw instanceof Date) {
    const iso = raw.toISOString();
    return { data: iso.substring(0, 10), dataHora: iso };
  }
  const s = String(raw).trim();
  if (!s) return { data: null, dataHora: null };
  // formatos: "25/06/2025 14:32:10" ou "25/06/2025"
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    const data = `${yyyy}-${mm}-${dd}`;
    if (hh) {
      const dataHora = `${data}T${hh}:${mi}:${ss || "00"}`;
      return { data, dataHora };
    }
    return { data, dataHora: null };
  }
  // ISO-like
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return { data: d.toISOString().substring(0, 10), dataHora: d.toISOString() };
  }
  return { data: null, dataHora: null };
}

function parseValor(raw: unknown): number {
  if (typeof raw === "number") return Math.abs(raw);
  const s = String(raw ?? "")
    .replace(/[^\d,.\-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

/**
 * Recebe o ArrayBuffer do arquivo e retorna as movimentações extraídas.
 * Lança se o cabeçalho não for reconhecido.
 */
export function parseXlsxSafraLancamentos(buffer: ArrayBuffer): SafraLancParsed {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  // Achar linha de cabeçalho: aquela que contém ao menos "status" e ("valor" OU "data")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const r = rows[i] || [];
    const temStatus = acharColuna(r, KEYS.status) >= 0;
    const temValor = acharColuna(r, KEYS.valor) >= 0;
    const temData = acharColuna(r, KEYS.data) >= 0;
    if (temStatus && (temValor || temData)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    const primeiras = rows.slice(0, 10).map((r) => (r || []).map(norm).join(" | "));
    throw new Error(
      "Cabeçalho Safra Lançamentos não reconhecido. Primeiras linhas: " +
        primeiras.join(" // ")
    );
  }

  const header = rows[headerIdx];
  const col = {
    data: acharColuna(header, KEYS.data),
    status: acharColuna(header, KEYS.status),
    origem: acharColuna(header, KEYS.origem),
    pagador: acharColuna(header, KEYS.pagador),
    doc: acharColuna(header, KEYS.doc),
    id: acharColuna(header, KEYS.id),
    identificador: acharColuna(header, KEYS.identificador),
    valor: acharColuna(header, KEYS.valor),
  };

  const movimentacoes: MovimentacaoSafraLanc[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every((c) => c == null || String(c).trim() === "")) continue;

    const status = col.status >= 0 ? String(r[col.status] ?? "").trim() : "";
    if (!status) continue;
    const statusUp = status.toUpperCase();
    const isCredito = /RECEB/.test(statusUp);
    const isDebito = /ENVIA|PAG/.test(statusUp);
    if (!isCredito && !isDebito) continue;

    const { data, dataHora } = parseData(col.data >= 0 ? r[col.data] : null);
    const valor = parseValor(col.valor >= 0 ? r[col.valor] : 0);
    if (!data || valor === 0) continue;

    const origem = col.origem >= 0 ? String(r[col.origem] ?? "").trim() : "";
    const pagadorRaw = col.pagador >= 0 ? String(r[col.pagador] ?? "").trim() : "";
    const docRaw = col.doc >= 0 ? String(r[col.doc] ?? "").trim() : "";
    const idTx = col.id >= 0 ? String(r[col.id] ?? "").trim() : "";
    const identRaw =
      col.identificador >= 0 ? String(r[col.identificador] ?? "").trim() : "";

    const documento = docRaw.replace(/\D/g, "") || null;
    const docValido =
      documento && (documento.length === 11 || documento.length === 14)
        ? documento
        : null;

    const descricao = [status, origem, pagadorRaw].filter(Boolean).join(" · ");

    movimentacoes.push({
      data_transacao: data,
      data_hora: dataHora,
      tipo: isCredito ? "credito" : "debito",
      valor,
      descricao: descricao || "Lançamento Safra",
      contraparte_nome: pagadorRaw || null,
      contraparte_documento: docValido,
      referencia_pedido: identRaw || null,
      tipo_meio: "pix",
      origem: "safra_lancamentos",
      id_transacao_banco: idTx || null,
    });
  }

  return {
    movimentacoes,
    cabecalhoDetectado: true,
    cabecalhoLidoRaw: header.map((c) => String(c ?? "")),
  };
}
