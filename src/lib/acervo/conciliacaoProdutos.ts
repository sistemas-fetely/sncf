// Agrupamento da fila de conciliação: uma linha por produto (sku).
// Anúncio do Shopify sem produto (cod_cadastro nulo) agrupa pelo próprio sku/handle.
export type LinhaFilaBase = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; fase: string | null;
  regra: string; onde_resolver: string | null;
  campo_matriz: string | null; valor_matriz: string | null; valor_destino: string | null;
};
export type ProdutoFila<L extends LinhaFilaBase> = {
  sku: string; cod_cadastro: string | null; nome_comercial: string | null; fase: string | null; linhas: L[];
};

export function agruparPorProduto<L extends LinhaFilaBase>(linhas: L[]): ProdutoFila<L>[] {
  const m = new Map<string, ProdutoFila<L>>();
  for (const l of linhas) {
    const g = m.get(l.sku);
    if (g) g.linhas.push(l);
    else m.set(l.sku, { sku: l.sku, cod_cadastro: l.cod_cadastro, nome_comercial: l.nome_comercial, fase: l.fase, linhas: [l] });
  }
  return [...m.values()];
}

/** Regras distintas do produto (uma vez cada, na ordem em que aparecem). */
export function regrasDoProduto<L extends LinhaFilaBase>(p: ProdutoFila<L>): L[] {
  const vistos = new Set<string>();
  return p.linhas.filter(l => (vistos.has(l.regra) ? false : (vistos.add(l.regra), true)));
}

const vazio = (v: unknown) => v == null || String(v).trim() === "";

/** Texto da coluna Campos. */
export function resumoCampos(linhas: LinhaFilaBase[]): string {
  const partes = linhas.map(l => {
    if (l.campo_matriz === "campos_diferentes") return vazio(l.valor_matriz) ? "" : String(l.valor_matriz);
    if (vazio(l.valor_matriz) && vazio(l.valor_destino)) return "";
    return `${vazio(l.valor_matriz) ? "—" : l.valor_matriz} → ${vazio(l.valor_destino) ? "—" : l.valor_destino}`;
  }).filter(Boolean);
  return [...new Set(partes)].join(" · ");
}

export type ColunaProduto = "cod_cadastro" | "sku" | "nome_comercial" | "fase" | "divergencias";

/** Ordena produtos; vazio sempre no fim. */
export function ordenarProdutos<L extends LinhaFilaBase>(ps: ProdutoFila<L>[], coluna: string, dir: "asc" | "desc"): ProdutoFila<L>[] {
  const mult = dir === "asc" ? 1 : -1;
  const chave = (p: ProdutoFila<L>): string | number | null =>
    coluna === "divergencias" ? regrasDoProduto(p).length : ((p as unknown as Record<string, string | null>)[coluna] ?? null);
  return [...ps].sort((a, b) => {
    const va = chave(a), vb = chave(b);
    const za = vazio(va), zb = vazio(vb);
    if (za && zb) return 0; if (za) return 1; if (zb) return -1;
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
    return cmp !== 0 ? cmp * mult : a.sku.localeCompare(b.sku, "pt-BR", { numeric: true });
  });
}

/** Por canal (onde_resolver): produtos distintos e divergências (linhas). */
export function contarPorCanal(linhas: LinhaFilaBase[]): Map<string, { produtos: number; divergencias: number }> {
  const m = new Map<string, { skus: Set<string>; n: number }>();
  for (const l of linhas) {
    const k = l.onde_resolver ?? "__sem__";
    const c = m.get(k) ?? { skus: new Set<string>(), n: 0 };
    c.skus.add(l.sku); c.n++; m.set(k, c);
  }
  return new Map([...m].map(([k, v]) => [k, { produtos: v.skus.size, divergencias: v.n }]));
}
