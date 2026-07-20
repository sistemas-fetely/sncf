/**
 * Parser CSV SafraPay Tipo 2 — Parcelas Liquidadas.
 * Este é o arquivo central do batimento de cartão SafraPay.
 * DT EFETIVA = data em que o crédito caiu na conta Safra.
 * Agregar por DT EFETIVA → soma VALOR RECEBIDO = valor do crédito no OFX.
 */

export interface SafraPayParcela {
  dt_venda: string;      // ISO
  dt_prevista: string;   // ISO
  dt_efetiva: string;    // ISO — chave do batimento
  nsu: string;
  produto: string;
  modalidade: string;
  parcela_num: number;   // PL
  ncar: number;          // número de parcelas
  valor_liquido: number;
  taxa_adm_pct: number;
  desc_mdr: number;
  valor_recebido: number; // líquido real creditado
  banco: string;
  agencia: string;
  conta: string;
  origem: "safrapay_tipo2";
}

export interface SafraPayTipo2Parsed {
  parcelas: SafraPayParcela[];
  ec: string;
  anomes: string;
  /** Mapa de DT_EFETIVA (ISO) → soma de VALOR_RECEBIDO — para batimento com OFX */
  lotes: Map<string, number>;
}

function parseSafraValor(s: string): number {
  const limpo = s.replace(/^0+/, "").replace(",", ".").trim();
  return parseFloat(limpo) || 0;
}

function parseSafraTaxa(s: string): number {
  const limpo = s.replace(/^0+/, "").replace(",", ".").trim();
  return parseFloat(limpo) || 0;
}

function parseSafraData(dd_mm_aaaa: string): string {
  const [d, m, a] = (dd_mm_aaaa || "").trim().split(".");
  if (!a) return "";
  return `${a}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

export function parseCsvSafraPayTipo2(text: string): SafraPayTipo2Parsed {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const parcelas: SafraPayParcela[] = [];
  let ec = "";
  let anomes = "";

  for (const line of lines) {
    const cols = line.split(";");
    const tipo = (cols[0] || "").trim();
    if (tipo !== "2") continue;

    ec = (cols[1] || "").trim();
    anomes = (cols[2] || "").trim();

    parcelas.push({
      dt_venda: parseSafraData(cols[4] || ""),
      dt_prevista: parseSafraData(cols[6] || ""),
      dt_efetiva: parseSafraData(cols[7] || ""),
      nsu: (cols[8] || "").replace(/^'/, "").trim(),
      produto: (cols[9] || "").trim(),
      modalidade: (cols[10] || "").trim(),
      parcela_num: parseInt(cols[11] || "1", 10) || 1,
      ncar: parseInt(cols[12] || "1", 10) || 1,
      valor_liquido: parseSafraValor(cols[13] || "0"),
      taxa_adm_pct: parseSafraTaxa(cols[14] || "0"),
      desc_mdr: parseSafraValor(cols[31] || "0"),
      valor_recebido: parseSafraValor(cols[34] || "0"),
      banco: (cols[26] || "").trim(),
      agencia: (cols[28] || "").trim(),
      conta: (cols[29] || "").trim(),
      origem: "safrapay_tipo2",
    });
  }

  const lotes = new Map<string, number>();
  for (const p of parcelas) {
    if (!p.dt_efetiva) continue;
    lotes.set(p.dt_efetiva, (lotes.get(p.dt_efetiva) || 0) + p.valor_recebido);
  }

  return { parcelas, ec, anomes, lotes };
}
