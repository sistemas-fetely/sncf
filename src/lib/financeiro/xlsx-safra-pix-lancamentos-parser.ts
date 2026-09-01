/**
 * Parser XLSX Safra — "Lançamentos e Devoluções" (PIX enviados e recebidos).
 *
 * ESTE ARQUIVO NÃO É EXTRATO. Os EndToEnd dele já entraram pelo OFX; casando por
 * `id_transacao_banco` toda linha é duplicada. O valor dele é o carimbo que o OFX
 * não traz: o número do pedido na coluna `Identificador`, mais nome e CPF/CNPJ do
 * pagador. Portanto: ENRIQUECIMENTO PURO — nunca insere movimentação.
 *
 * Layout medido (não suposto):
 *   linha 1  Banco Safra + data/hora de emissão
 *   linha 2  CNPJ: 58.160.789/0001-28
 *   linha 4  Lançamentos e Devoluções
 *   linha 5  Período de: dd/mm/aaaa a dd/mm/aaaa
 *   linha 8  cabeçalho de dados (skiprows=7)
 *   Data/Hora | Status | Origem do Lançamento | Dados do pagador / recebedor |
 *   CPF / CNPJ | ID Transação | Identificador | Valor
 *
 * O período pode conter datas FUTURAS (agendamentos) — não é erro.
 */

import * as XLSX from "xlsx";

export interface LinhaPixSafra {
  data_transacao: string | null;
  data_hora: string | null;
  tipo: "credito" | "debito";
  valor: number;
  descricao: string;
  contraparte_nome: string | null;
  contraparte_documento: string | null;
  /** Já normalizado para o formato gravado hoje pelo OFX: `PED2184`. */
  referencia_pedido: string | null;
  /** EndToEnd — 32 caracteres, começa com E. */
  id_transacao_banco: string | null;
}

export interface SafraPixParsed {
  linhas: LinhaPixSafra[];
  /** CNPJ do relatório (só dígitos), extraído do cabeçalho institucional. */
  cnpj_relatorio: string | null;
}

const LINHA_CABECALHO = 7; // skiprows=7

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * `referencia_pedido` no extrato é gravado como o Safra manda: `PED` + número,
 * caixa alta, sem separador (`PED2184`). Aqui só aceitamos o que começa com PED
 * — hash aleatório e campo vazio não são pedido.
 */
export function normalizarReferenciaPedido(bruto: string): string | null {
  const s = bruto.toUpperCase().replace(/\s+/g, "");
  if (!s.startsWith("PED")) return null;
  const resto = s.slice(3).replace(/[^0-9A-Z]/g, "");
  if (!resto) return null;
  return `PED${resto}`;
}

function parseDataHora(bruto: unknown): { data: string | null; dataHora: string | null } {
  if (bruto instanceof Date) {
    const iso = bruto.toISOString();
    return { data: iso.substring(0, 10), dataHora: iso };
  }
  const s = txt(bruto);
  // "28/08/2026 - 16:06:52" ou "28/08/2026"
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return { data: null, dataHora: null };
  const [, dd, mm, yyyy, hh, mi, ss] = m;
  const data = `${yyyy}-${mm}-${dd}`;
  return { data, dataHora: hh ? `${data}T${hh}:${mi}:${ss || "00"}` : null };
}

function parseValor(bruto: unknown): number {
  if (typeof bruto === "number") return Math.abs(bruto);
  const s = txt(bruto)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

/** CPF/CNPJ só dígitos; mascarado com `***` não é documento. */
function parseDocumento(bruto: unknown): string | null {
  const s = txt(bruto);
  if (!s || s.includes("*")) return null;
  const d = s.replace(/\D/g, "");
  return d.length === 11 || d.length === 14 ? d : null;
}

function extrairCnpjRelatorio(rows: unknown[][]): string | null {
  for (const r of rows.slice(0, LINHA_CABECALHO)) {
    for (const c of r || []) {
      const m = txt(c).match(/CNPJ[:\s]*([\d./-]{14,20})/i);
      if (m) {
        const d = m[1].replace(/\D/g, "");
        if (d.length === 14) return d;
      }
    }
  }
  return null;
}

export function parseXlsxSafraPixLancamentos(buffer: ArrayBuffer): SafraPixParsed {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  const cnpj_relatorio = extrairCnpjRelatorio(rows);

  const linhas: LinhaPixSafra[] = [];
  for (let i = LINHA_CABECALHO + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every((c) => c == null || txt(c) === "")) continue;

    const [dataRaw, statusRaw, origemRaw, pagadorRaw, docRaw, idRaw, identRaw, valorRaw] = [
      r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7],
    ];

    const status = txt(statusRaw);
    if (!status) continue;
    const statusUp = status.toUpperCase();
    const credito = statusUp.startsWith("RECEB");

    const { data, dataHora } = parseDataHora(dataRaw);
    const e2e = txt(idRaw).replace(/\s+/g, "");

    linhas.push({
      data_transacao: data,
      data_hora: dataHora,
      tipo: credito ? "credito" : "debito",
      valor: parseValor(valorRaw),
      descricao: [status, txt(origemRaw), txt(pagadorRaw)].filter(Boolean).join(" · "),
      contraparte_nome: txt(pagadorRaw) || null,
      contraparte_documento: parseDocumento(docRaw),
      referencia_pedido: normalizarReferenciaPedido(txt(identRaw)),
      id_transacao_banco: e2e.length === 32 && e2e.toUpperCase().startsWith("E") ? e2e : null,
    });
  }

  return { linhas, cnpj_relatorio };
}
