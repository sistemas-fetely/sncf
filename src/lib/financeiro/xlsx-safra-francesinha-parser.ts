/**
 * Parser — Safra "Gestão de Cobrança - Francesinha" (.xlsx)
 *
 * O valor deste relatório é o que o "Instruções 2ª via" não tem: juros,
 * descontos, comissões, DDA e o código de ocorrência CNAB (campo Situação,
 * ex. "51 - Liq.por Compensação de Cobrança").
 *
 * Estrutura esperada:
 *  - linha 4  (índice 3): título "Gestão de Cobrança - Francesinha"
 *  - linha 8  (índice 7): conta de recebimento + data do período (referência)
 *  - blocos de resumo: "Boletos em Carteira" e "LIQUIDAÇÕES"
 *  - tabela detalhada a partir da linha 22 (índice 21)
 */
import * as XLSX from "xlsx";

export const CABECALHO_FRANCESINHA_ESPERADO =
  "Vencimento | Pagamento | Nº documento | Nosso nº | Pagador | Valor boleto (R$) | " +
  "Valor pago (R$) | Diferença (R$) | Descontos / abatimentos (R$) | Juros (R$) | " +
  "Comissões | DDA | Situação";

export type FrancesinhaLinha = {
  data_vencimento: string | null;
  data_pagamento: string | null;
  numero_documento: string | null;
  nosso_numero: string;
  pagador: string | null;
  valor_boleto: number;
  valor_pago: number;
  diferenca: number;
  descontos: number;
  juros: number;
  comissoes: number;
  dda: string | null;
  situacao: string | null;
  /** Código CNAB extraído de "51 - Liq.por Compensação de Cobrança" */
  ocorrencia_codigo: string | null;
};

export type FrancesinhaResumo = {
  conta_recebimento: string | null;
  saldo_hoje_qtde: number;
  saldo_hoje_valor: number;
  saldo_anterior_qtde: number;
  saldo_anterior_valor: number;
  liquidacoes: number;
  descontos_abatimentos: number;
  juros_mora: number;
  total_liquido: number;
};

export type FrancesinhaParsed = {
  data_referencia: string;
  data_referencia_inferida: boolean;
  resumo: FrancesinhaResumo;
  linhas: FrancesinhaLinha[];
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

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/[R$\s]/g, "");
  if (!s || s === "-") return 0;
  const negativo = /^\(.*\)$/.test(s);
  const limpo = s.replace(/[()]/g, "");
  const n = limpo.includes(",")
    ? parseFloat(limpo.replace(/\./g, "").replace(",", "."))
    : parseFloat(limpo);
  if (!Number.isFinite(n)) return 0;
  return Math.round((negativo ? -n : n) * 100) / 100;
}

function dataISO(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(
      v.getDate()
    ).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (!s || s === "-") return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let ano = parseInt(m[3], 10);
    if (ano < 100) ano += 2000;
    return `${ano}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

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

export function ehSafraFrancesinha(buf: ArrayBuffer): boolean {
  return temTitulo(lerRows(buf), /francesinha/);
}


/** Acha, numa linha que contenha o rótulo, os números à direita dele */
function numerosAposRotulo(rows: unknown[][], rotulo: string): number[] {
  const alvo = normalizar(rotulo);
  for (const r of rows) {
    const cels = r || [];
    const pos = cels.findIndex((c) => normalizar(c).includes(alvo));
    if (pos < 0) continue;
    const nums: number[] = [];
    for (let i = pos + 1; i < cels.length; i++) {
      const c = cels[i];
      if (c === null || c === undefined || String(c).trim() === "") continue;
      const n = num(c);
      if (n !== 0 || /^[\d.,\s()R$-]+$/.test(String(c).trim())) nums.push(n);
    }
    if (nums.length > 0) return nums;
  }
  return [];
}

export function parseXlsxSafraFrancesinha(buf: ArrayBuffer): FrancesinhaParsed {
  const rows = lerRows(buf);

  const titulo = (rows[3] || []).map(normalizar).join(" | ");
  if (!titulo.includes("francesinha")) {
    throw new Error(
      "Arquivo não é o relatório Safra 'Gestão de Cobrança - Francesinha'. " +
        `Esperado na linha 4 o título 'Gestão de Cobrança - Francesinha' e a tabela detalhada a partir da linha 22 com o cabeçalho: ${CABECALHO_FRANCESINHA_ESPERADO}`
    );
  }

  // Linha 8: conta de recebimento + data do período
  const linha8 = (rows[7] || []).map((c) => String(c ?? "").trim()).filter(Boolean);
  const textoLinha8 = linha8.join(" ");
  const dataRef = dataISO(textoLinha8);
  const conta_recebimento =
    linha8.find((s) => /\d/.test(s) && !/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(s)) ?? null;

  // Cabeçalho da tabela detalhada (índice 21 pelo padrão; busca curta como salvaguarda)
  let headerIdx = -1;
  for (let i = 21; i >= 0 && i >= 15; i--) {
    const h = (rows[i] || []).map(normalizar);
    if (h.some((c) => c.includes("nosso")) && h.some((c) => c.includes("vencimento"))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    for (let i = 21; i < Math.min(rows.length, 40); i++) {
      const h = (rows[i] || []).map(normalizar);
      if (h.some((c) => c.includes("nosso")) && h.some((c) => c.includes("vencimento"))) {
        headerIdx = i;
        break;
      }
    }
  }
  if (headerIdx < 0) {
    throw new Error(
      `Tabela detalhada da Francesinha não encontrada. Esperado cabeçalho a partir da linha 22: ${CABECALHO_FRANCESINHA_ESPERADO}`
    );
  }

  const header = (rows[headerIdx] || []).map(normalizar);
  const acha = (...frag: string[]) =>
    header.findIndex((h) => frag.every((f) => h.includes(normalizar(f))));
  const cols = {
    vencimento: acha("vencimento"),
    pagamento: acha("pagamento"),
    documento: acha("documento"),
    nossoNumero: acha("nosso"),
    pagador: acha("pagador"),
    valorBoleto: acha("valor boleto"),
    valorPago: acha("valor pago"),
    diferenca: acha("diferenca"),
    descontos: acha("desconto"),
    juros: acha("juros"),
    comissoes: acha("comiss"),
    dda: acha("dda"),
    situacao: acha("situacao"),
  };

  const obrigatorias: (keyof typeof cols)[] = [
    "vencimento",
    "pagamento",
    "nossoNumero",
    "valorBoleto",
    "valorPago",
    "situacao",
  ];
  const faltando = obrigatorias.filter((k) => cols[k] < 0);
  if (faltando.length > 0) {
    throw new Error(
      `Cabeçalho da Francesinha não bate (colunas ausentes: ${faltando.join(", ")}). ` +
        `Esperado: ${CABECALHO_FRANCESINHA_ESPERADO}`
    );
  }

  const linhas: FrancesinhaLinha[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const nossoNumero = txt(r[cols.nossoNumero]);
    if (!nossoNumero) continue;
    if (normalizar(nossoNumero).startsWith("total")) continue;
    if (normalizar(nossoNumero).includes("nosso")) continue;

    const situacao = txt(r[cols.situacao]);
    const mOc = situacao?.match(/^(\d{2,3})\s*-/);
    linhas.push({
      data_vencimento: dataISO(r[cols.vencimento]),
      data_pagamento: dataISO(r[cols.pagamento]),
      numero_documento: cols.documento >= 0 ? txt(r[cols.documento]) : null,
      nosso_numero: nossoNumero,
      pagador: cols.pagador >= 0 ? txt(r[cols.pagador]) : null,
      valor_boleto: num(r[cols.valorBoleto]),
      valor_pago: num(r[cols.valorPago]),
      diferenca: cols.diferenca >= 0 ? num(r[cols.diferenca]) : 0,
      descontos: cols.descontos >= 0 ? num(r[cols.descontos]) : 0,
      juros: cols.juros >= 0 ? num(r[cols.juros]) : 0,
      comissoes: cols.comissoes >= 0 ? num(r[cols.comissoes]) : 0,
      dda: cols.dda >= 0 ? txt(r[cols.dda]) : null,
      situacao,
      ocorrencia_codigo: mOc ? mOc[1] : null,
    });
  }

  const resumoRows = rows.slice(0, headerIdx);
  const saldoHoje = numerosAposRotulo(resumoRows, "saldo hoje");
  const saldoAnterior = numerosAposRotulo(resumoRows, "saldo anterior");
  const liq = numerosAposRotulo(resumoRows, "liquidacoes");
  const desc = numerosAposRotulo(resumoRows, "desconto");
  const juros = numerosAposRotulo(resumoRows, "juros");
  const totalLiq = numerosAposRotulo(resumoRows, "total liquido");

  return {
    data_referencia: dataRef || hoje(),
    data_referencia_inferida: !dataRef,
    resumo: {
      conta_recebimento,
      saldo_hoje_qtde: saldoHoje[0] ?? 0,
      saldo_hoje_valor: saldoHoje[1] ?? 0,
      saldo_anterior_qtde: saldoAnterior[0] ?? 0,
      saldo_anterior_valor: saldoAnterior[1] ?? 0,
      liquidacoes: liq[liq.length - 1] ?? 0,
      descontos_abatimentos: desc[desc.length - 1] ?? 0,
      juros_mora: juros[juros.length - 1] ?? 0,
      total_liquido: totalLiq[totalLiq.length - 1] ?? 0,
    },
    linhas,
  };
}
