/**
 * Parser XLSX SafraPay — "Recebiveis de Vendas" (LIQUIDAÇÃO / repasse).
 *
 * COMPOSICAO-DO-LOTE (02/09/2026)
 *
 * O extrato traz o repasse de cartão como LOTE: "RESUMO VENDAS CARTAO CRED",
 * sem NSU. Este relatório traz a COMPOSIÇÃO desse lote — uma linha por
 * NSU + parcela, com valor bruto, valor líquido e a data em que o dinheiro caiu.
 *
 * NÃO confundir com "Agenda de Vendas": aquele é a AUTORIZAÇÃO (já vive em
 * `safrapay_venda`); este é o repasse. Eventos diferentes, tabelas diferentes.
 *
 * Layout medido (não suposto):
 *   linha 1  Banco Safra S/A + emissão
 *   linha 2  CNPJ: ... + "Período de DD/MM/AAAA até DD/MM/AAAA"
 *   linha 4  título "Recebiveis de Vendas"
 *   linha 7  cabeçalho de dados (skiprows=6)
 *   Data do Pagamento | Bandeira | Número do Cartão | Modalidade |
 *   Número do Terminal | Estabelecimento Comercial | Valor Bruto da Venda |
 *   Valor Líquido da Venda | Número Sequencial Único | Número de Autorização |
 *   Parcela | Cartão Estrangeiro
 *
 * `Parcela` vem como `(2/3)` — parcela 2 de 3. Na Agenda de Vendas o mesmo
 * campo vem como `(3)`, só o total: aqui, `(3)` significa parcela 1 de 3.
 */

import * as XLSX from "xlsx";

export interface LinhaRecebivelSafraPay {
  data_pagamento: string | null;
  bandeira: string | null;
  cartao_mascarado: string | null;
  modalidade: string | null;
  terminal: string | null;
  ec: string | null;
  valor_bruto_parcela: number | null;
  valor_liquido: number | null;
  nsu: string | null;
  autorizacao: string | null;
  parcela: number;
  total_parcelas: number;
}

export interface SafraPayRecebiveisParsed {
  linhas: LinhaRecebivelSafraPay[];
  cnpj_relatorio: string | null;
}

const LINHA_CABECALHO = 6; // skiprows=6 → dados começam em 7

function txt(v: unknown): string {
  return String(v ?? "").trim();
}

/** " R$ 1.625,57" → 1625.57 */
export function parseValorSafraPay(bruto: unknown): number | null {
  if (typeof bruto === "number") return bruto;
  const s = txt(bruto);
  if (!s) return null;
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo || limpo === "-") return null;
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

/** "17/08/2026" → "2026-08-17" */
export function parseDataSafraPay(bruto: unknown): string | null {
  if (bruto instanceof Date) return bruto.toISOString().substring(0, 10);
  const m = txt(bruto).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * `(2/3)` → parcela 2 de 3. `(3)` (formato da Agenda de Vendas) → 1 de 3.
 * Vazio ou ilegível → 1 de 1: uma venda à vista é uma parcela.
 */
export function parseParcelaRecebivel(bruto: unknown): { parcela: number; total: number } {
  const s = txt(bruto).replace(/[()\s]/g, "");
  const dois = s.match(/^(\d+)\/(\d+)$/);
  if (dois) return { parcela: Number(dois[1]) || 1, total: Number(dois[2]) || 1 };
  const um = s.match(/^(\d+)$/);
  if (um) return { parcela: 1, total: Number(um[1]) || 1 };
  return { parcela: 1, total: 1 };
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

/**
 * COLUNA-VEM-DO-CABECALHO: as posições fixas ficam como plano B, mas quem manda
 * é o nome do cabeçalho. Trocar `Valor Bruto da Venda` por `Valor Líquido da
 * Venda` zera o MDR sem erro nenhum na tela — defeito silencioso.
 */
function indicePorNome(rows: unknown[][]): Record<string, number> {
  const cab = rows[LINHA_CABECALHO] || [];
  const mapa: Record<string, number> = {};
  cab.forEach((c, i) => {
    const k = txt(c).toLowerCase().replace(/\s+/g, " ");
    if (k) mapa[k] = i;
  });
  return mapa;
}

function idx(mapa: Record<string, number>, nome: string, padrao: number): number {
  const i = mapa[nome.toLowerCase()];
  return i == null ? padrao : i;
}

export function parseXlsxSafraPayRecebiveis(buffer: ArrayBuffer): SafraPayRecebiveisParsed {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null }) as unknown[][];

  const cnpj_relatorio = extrairCnpjRelatorio(rows);
  const cab = indicePorNome(rows);
  const cData = idx(cab, "Data do Pagamento", 0);
  const cBandeira = idx(cab, "Bandeira", 1);
  const cCartao = idx(cab, "Número do Cartão", 2);
  const cModalidade = idx(cab, "Modalidade", 3);
  const cTerminal = idx(cab, "Número do Terminal", 4);
  const cEc = idx(cab, "Estabelecimento Comercial", 5);
  const cBruto = idx(cab, "Valor Bruto da Venda", 6);
  const cLiquido = idx(cab, "Valor Líquido da Venda", 7);
  const cNsu = idx(cab, "Número Sequencial Único", 8);
  const cAut = idx(cab, "Número de Autorização", 9);
  const cParcela = idx(cab, "Parcela", 10);
  const linhas: LinhaRecebivelSafraPay[] = [];

  for (let i = LINHA_CABECALHO + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (r.every((c) => c == null || txt(c) === "")) continue;

    const { parcela, total } = parseParcelaRecebivel(r[cParcela]);
    linhas.push({
      data_pagamento: parseDataSafraPay(r[cData]),
      bandeira: txt(r[cBandeira]) || null,
      cartao_mascarado: txt(r[cCartao]) || null,
      modalidade: txt(r[cModalidade]) || null,
      terminal: txt(r[cTerminal]) || null,
      ec: txt(r[cEc]) || null,
      valor_bruto_parcela: parseValorSafraPay(r[cBruto]),
      valor_liquido: parseValorSafraPay(r[cLiquido]),
      nsu: txt(r[cNsu]).replace(/^'/, "") || null,
      autorizacao: txt(r[cAut]) || null,
      parcela,
      total_parcelas: total,
    });
  }

  return { linhas, cnpj_relatorio };
}
