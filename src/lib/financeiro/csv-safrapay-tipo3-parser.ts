/**
 * Parser CSV SafraPay Tipo 3 — Ajustes de adquirência.
 * Cabeçalho: T;EC;AAAAMM;DT AJUSTE;NSU;SEQUENCIA;DESCRICAO DO AJUSTE;D/C;VALOR
 * Ajuste sempre chega junto de um crédito que já está no OFX: só enriquece,
 * nunca cria linha nova.
 */

export interface SafraPayAjuste {
  dt_ajuste: string; // ISO
  nsu: string;
  sequencia: string;
  descricao: string;
  natureza: "D" | "C";
  valor: number;
  origem: "safrapay_ajustes";
}

export interface SafraPayTipo3Parsed {
  ajustes: SafraPayAjuste[];
  ec: string;
  anomes: string;
}

function parseSafraValor(s: string): number {
  const limpo = (s || "").replace(/^0+/, "").replace(",", ".").trim();
  return parseFloat(limpo) || 0;
}

function parseSafraData(s: string): string {
  const bruto = (s || "").trim();
  const partes = bruto.split(/[./-]/);
  if (partes.length !== 3) return "";
  const [d, m, a] = partes;
  if (!a) return "";
  return `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseCsvSafraPayTipo3(text: string): SafraPayTipo3Parsed {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
  const ajustes: SafraPayAjuste[] = [];
  let ec = "";
  let anomes = "";

  for (const line of lines) {
    const cols = line.split(";");
    if ((cols[0] || "").trim() !== "3") continue;

    ec = (cols[1] || "").trim();
    anomes = (cols[2] || "").trim();

    const natureza = (cols[7] || "").trim().toUpperCase() === "D" ? "D" : "C";
    ajustes.push({
      dt_ajuste: parseSafraData(cols[3] || ""),
      nsu: (cols[4] || "").replace(/^'/, "").trim(),
      sequencia: (cols[5] || "").trim(),
      descricao: (cols[6] || "").trim(),
      natureza,
      valor: parseSafraValor(cols[8] || "0"),
      origem: "safrapay_ajustes",
    });
  }

  return { ajustes, ec, anomes };
}
