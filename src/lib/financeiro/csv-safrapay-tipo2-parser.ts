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

/**
 * Índices padrão (posição fixa) das colunas do tipo 2 — 35 colunas.
 * Usados só como fallback quando o cabeçalho (linha `T;EC;...`) não vier.
 */
const IDX_PADRAO = {
  "DT VENDA": 4,
  "DT PREVISTA": 6,
  "DT EFETIVA": 7,
  "NSU": 8,
  "PRODUTO": 9,
  "MODALIDADE": 10,
  "PL": 11,
  "NCAR": 12,
  "VALOR BRUTO PARC.": 20,
  "TAXA ADM": 14,
  "DESC MDR": 31,
  "DESC ANTFRD": 32,
  "DESC ANTC": 33,
  "VALOR RECEBIDO": 34,
  "BANCO": 26,
  "AGENCIA": 28,
  "CONTA": 29,
} as const;

type ChaveColuna = keyof typeof IDX_PADRAO;

function normalizarNome(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ASSINATURA-MANDA-NO-NOME: os índices saem do cabeçalho do próprio arquivo
 * (linha que começa com `T;EC`); posição fixa é apenas o padrão.
 */
function resolverIndices(lines: string[]): Record<ChaveColuna, number> {
  const idx = { ...IDX_PADRAO } as Record<ChaveColuna, number>;
  const header = lines.find((l) => /^T;EC/i.test(l.trim()));
  if (!header) return idx;
  const nomes = header.split(";").map(normalizarNome);
  for (const chave of Object.keys(IDX_PADRAO) as ChaveColuna[]) {
    const alvo = normalizarNome(chave);
    const achado = nomes.findIndex((n) => n === alvo);
    if (achado >= 0) idx[chave] = achado;
  }
  return idx;
}

export function parseCsvSafraPayTipo2(text: string): SafraPayTipo2Parsed {
  const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim());
  const parcelas: SafraPayParcela[] = [];
  let ec = "";
  let anomes = "";
  const IDX = resolverIndices(lines);

  for (const line of lines) {
    const cols = line.split(";");
    const tipo = (cols[0] || "").trim();
    if (tipo !== "2") continue;

    ec = (cols[1] || "").trim();
    anomes = (cols[2] || "").trim();

    // BRUTO-E-RECEBIDO-SAO-COLUNAS-DIFERENTES. Índices reais no layout de 35
    // colunas (conferidos em 1467477_2_202609_20260901073238.csv):
    //   13 = VALOR LIQUIDO      (igual ao recebido — NÃO é o bruto)
    //   19 = VALOR TOTAL VENDA  (a venda inteira, todas as parcelas)
    //   20 = VALOR BRUTO PARC.  ← o bruto desta parcela
    //   34 = VALOR RECEBIDO     (o que caiu na conta)
    // Ler 13 como bruto zera o MDR em todas as linhas.
    const recebido = parseSafraValor(cols[IDX["VALOR RECEBIDO"]] || "0");
    const descMdr = parseSafraValor(cols[IDX["DESC MDR"]] || "0");
    const descAntifraude = parseSafraValor(cols[IDX["DESC ANTFRD"]] || "0");
    const descAntecipacao = parseSafraValor(cols[IDX["DESC ANTC"]] || "0");
    let brutoParcela = parseSafraValor(cols[IDX["VALOR BRUTO PARC."]] || "0");
    // Rede de segurança (plano B): quando a coluna de bruto vem vazia ou
    // repetindo o recebido, reconstrói pelos descontos decompostos. Sem
    // inventar taxa: se não há desconto algum, bruto = recebido é a verdade.
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
