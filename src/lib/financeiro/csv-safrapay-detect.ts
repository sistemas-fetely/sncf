/**
 * Detecção de arquivo SafraPay pelo CONTEÚDO.
 *
 * Doutrina: o arquivo declara o próprio tipo na primeira coluna de toda linha.
 * Se o cabeçalho começa exatamente com a coluna `T`, o tipo é o valor da
 * primeira coluna das linhas de detalhe (1 = Vendas, 2 = Realizado, 3 = Ajustes).
 * Sem coluna `T`, cai na assinatura de cabeçalho (SUPER AGENDA).
 * Nunca assumir tipo por padrão — arquivo desconhecido retorna null.
 */

export type SafraPayTipoArquivo =
  | "safrapay_vendas"
  | "safrapay_liquidacao"
  | "safrapay_ajustes"
  | "safrapay_link"
  | "super_agenda";

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface DeteccaoCsvSafraPay {
  tipo: SafraPayTipoArquivo | null;
  /** Primeiras linhas cruas — vão para erro_detalhe quando nada bate. */
  amostra: string;
}

export function detectarCsvSafraPay(text: string): DeteccaoCsvSafraPay {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim());
  const amostra = lines.slice(0, 5).join("\n").slice(0, 800);
  if (!lines.length) return { tipo: null, amostra };

  const header = lines[0].split(";").map(norm);
  const headerTexto = header.join(";");

  // SUPER AGENDA: não tem coluna T e tem VALOR CONSTITUIDO
  if (header[0] !== "T") {
    if (/VALOR CONSTITUIDO/.test(headerTexto)) return { tipo: "super_agenda", amostra };
    return { tipo: null, amostra };
  }

  // Coluna T presente → o tipo vem das linhas de detalhe
  for (const l of lines.slice(1)) {
    const t = (l.split(";")[0] || "").trim();
    if (t === "1") return { tipo: "safrapay_vendas", amostra };
    if (t === "2") return { tipo: "safrapay_liquidacao", amostra };
    if (t === "3") return { tipo: "safrapay_ajustes", amostra };
  }

  // Sem linha de detalhe: assinatura do cabeçalho
  if (/DT AJUSTE/.test(headerTexto) && /DESCRICAO DO AJUSTE/.test(headerTexto))
    return { tipo: "safrapay_ajustes", amostra };
  if (/DT PREVIST/.test(headerTexto) || /DT EFETIVA/.test(headerTexto))
    return { tipo: "safrapay_liquidacao", amostra };
  if (/DATA VENDA/.test(headerTexto) && /TAXA ADMN/.test(headerTexto))
    return { tipo: "safrapay_vendas", amostra };

  return { tipo: null, amostra };
}
