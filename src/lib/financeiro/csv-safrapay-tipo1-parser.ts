/**
 * Parser CSV SafraPay Tipo 1 — Vendas Realizadas.
 * Separador: ponto-e-vírgula. Primeira linha = header.
 * Coluna T=1 identifica o tipo.
 * NSU tem apóstrofo inicial — remover.
 * Valores no formato 000000000005637,82 — remover zeros e converter vírgula.
 */

export interface SafraPayVenda {
  data_venda: string;         // DD/MM/AAAA → ISO
  hora: string;
  nsu: string;
  produto: string;            // MASTERCARD, VISA, ELO, AMEX
  modalidade: string;         // CREDITO A VISTA, CRED PARC S/JURO 2-6, etc.
  parcelas: number;
  valor_bruto: number;
  taxa_adm_pct: number;       // 0002,15000 → 2.15
  valor_liquido: number;
  origem: "safrapay_tipo1";
}

export interface SafraPayTipo1Parsed {
  vendas: SafraPayVenda[];
  ec: string;
  anomes: string;
}

function parseSafraValor(s: string): number {
  const limpo = s.replace(/^0+/, "").replace(",", ".").trim();
  return parseFloat(limpo) || 0;
}

function parseSafraTaxa(s: string): number {
  // "0002,15000" → 2.15
  const limpo = s.replace(/^0+/, "").replace(",", ".").trim();
  return parseFloat(limpo) || 0;
}

function parseSafraData(dd_mm_aaaa: string): string {
  const [d, m, a] = dd_mm_aaaa.trim().split("/");
  return `${a}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
}

export function parseCsvSafraPayTipo1(text: string): SafraPayTipo1Parsed {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const vendas: SafraPayVenda[] = [];
  let ec = "";
  let anomes = "";

  for (const line of lines) {
    const cols = line.split(";");
    const tipo = (cols[0] || "").trim();
    if (tipo !== "1") continue;

    ec = (cols[1] || "").trim();
    anomes = (cols[2] || "").trim();

    vendas.push({
      data_venda: parseSafraData(cols[4] || ""),
      hora: (cols[5] || "").trim(),
      nsu: (cols[6] || "").replace(/^'/, "").trim(),
      produto: (cols[7] || "").trim(),
      modalidade: (cols[8] || "").trim(),
      parcelas: parseInt(cols[9] || "1", 10) || 1,
      valor_bruto: parseSafraValor(cols[11] || "0"),
      taxa_adm_pct: parseSafraTaxa(cols[12] || "0"),
      valor_liquido: parseSafraValor(cols[15] || "0"),
      origem: "safrapay_tipo1",
    });
  }

  return { vendas, ec, anomes };
}
