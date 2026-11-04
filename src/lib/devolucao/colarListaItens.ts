export type ItemNfBase = { codigo: string; quantidade: number };

export type ResultadoColagem = {
  casados: Record<string, number>;
  naoEncontrados: string[];
  acimaNf: { codigo: string; qtd: number; qtdNf: number }[];
};

const norm = (s: string) => s.trim().toUpperCase();

/** Lê uma lista colada (TAB, ";" ou espaço). Código = primeiro token que casa SKU da NF;
 *  qtd = primeiro número após o código (ausente → qtd cheia da NF). Linhas sem SKU e só texto
 *  (cabeçalho/total) são ignoradas; linhas com código desconhecido vão para naoEncontrados. */
export function interpretarListaColada(texto: string, itensNf: ItemNfBase[]): ResultadoColagem {
  const mapa = new Map(itensNf.map((i) => [norm(i.codigo), i]));
  const casados: Record<string, number> = {};
  const naoEncontrados: string[] = [];
  const acimaNf: ResultadoColagem["acimaNf"] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const tokens = linha.split(/[\t;]+|\s+/).map((t) => t.trim()).filter(Boolean);
    if (!tokens.length) continue;
    const idx = tokens.findIndex((t) => mapa.has(norm(t)));
    if (idx < 0) {
      if (/^(total|subtotal)/i.test(tokens[0])) continue;
      // Cabeçalho: nenhum token parece código (tem dígito). Senão é código não encontrado.
      const candidato = tokens.find((t) => /\d/.test(t) && /[a-z]/i.test(t)) ?? (tokens.length === 1 ? tokens[0] : null);
      if (candidato && !/^(c[oó]d|sku|qtd|quant)/i.test(tokens[0])) naoEncontrados.push(candidato);
      continue;
    }
    const item = mapa.get(norm(tokens[idx]))!;
    const qTok = tokens.slice(idx + 1).find((t) => /^\d+([.,]\d+)?$/.test(t));
    const qtd = qTok != null ? Number(qTok.replace(",", ".")) : Number(item.quantidade);
    const total = (casados[item.codigo] ?? 0) + qtd;
    if (!Number.isFinite(qtd) || qtd <= 0) continue;
    if (total > Number(item.quantidade)) {
      acimaNf.push({ codigo: item.codigo, qtd: total, qtdNf: Number(item.quantidade) });
      delete casados[item.codigo];
      continue;
    }
    if (!acimaNf.some((a) => a.codigo === item.codigo)) casados[item.codigo] = total;
  }
  return { casados, naoEncontrados, acimaNf };
}
