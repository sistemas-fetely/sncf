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
  /** VALOR BRUTO PARC. — o que a venda valia antes de qualquer desconto. */
  valor_bruto_parcela: number;
  taxa_adm_pct: number;
  desc_mdr: number;
  desc_antifraude: number;
  desc_antecipacao: number;
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
  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
  const parcelas: SafraPayParcela[] = [];
  let ec = "";
  let anomes = "";

  for (const line of lines) {
    const cols = line.split(";");
    const tipo = (cols[0] || "").trim();
    if (tipo !== "2") continue;

    ec = (cols[1] || "").trim();
    anomes = (cols[2] || "").trim();

    // BRUTO-E-RECEBIDO-SAO-COLUNAS-DIFERENTES: `VALOR BRUTO PARC.` é o valor da
    // parcela antes dos descontos; `VALOR RECEBIDO` é o que caiu na conta. Ler o
    // mesmo campo nos dois zera o MDR e a conciliação perde a taxa.
    const recebido = parseSafraValor(cols[34] || "0");
    const descMdr = parseSafraValor(cols[31] || "0");
    const descAntifraude = parseSafraValor(cols[32] || "0");
    const descAntecipacao = parseSafraValor(cols[33] || "0");
    let brutoParcela = parseSafraValor(cols[13] || "0");
    // Rede de segurança: quando a coluna de bruto vem vazia ou repetindo o
    // recebido, reconstrói pelos descontos decompostos. Sem inventar taxa:
    // se não há desconto algum, bruto = recebido é a verdade.
    if (brutoParcela <= 0 || brutoParcela === recebido) {
      const somaDescontos = Number(
        (descMdr + descAntifraude + descAntecipacao).toFixed(2)
      );
      if (somaDescontos > 0)
        brutoParcela = Number((recebido + somaDescontos).toFixed(2));
      else if (brutoParcela <= 0) brutoParcela = recebido;
    }

    parcelas.push({
      dt_venda: parseSafraData(cols[4] || ""),
      dt_prevista: parseSafraData(cols[6] || ""),
      dt_efetiva: parseSafraData(cols[7] || ""),
      nsu: (cols[8] || "").replace(/^'/, "").trim(),
      produto: (cols[9] || "").trim(),
      modalidade: (cols[10] || "").trim(),
      parcela_num: parseInt(cols[11] || "1", 10) || 1,
      ncar: parseInt(cols[12] || "1", 10) || 1,
      valor_bruto_parcela: brutoParcela,
      taxa_adm_pct: parseSafraTaxa(cols[14] || "0"),
      desc_mdr: descMdr,
      desc_antifraude: descAntifraude,
      desc_antecipacao: descAntecipacao,
      valor_recebido: recebido,
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
