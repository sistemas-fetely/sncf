// Propostas da planilha v2 (aba "Códigos e EAN" + Catálogo) gravadas pela leitura em totais.propostas.
export type PropostaCartorio = { tipo: 'reservar' | 'mudar_inner'; linha: number; ean: string; cod_cadastro: string; dun: string | null; inner_antes: number | null; inner_qtd: number | null };
export type PropostaNascimento = { linha: number; cod_cadastro: string; ean: string; dun: string | null; inner_qtd: number | null; nome_comercial: string | null; origem: string; reserva_na_planilha: boolean };
export type RecusaProposta = { aba: 'codigos' | 'catalogo'; linha: number; cod_cadastro: string | null; ean: string | null; motivo: string };
export type PropostasCatalogo = { cartorio: PropostaCartorio[]; nascimentos: PropostaNascimento[]; recusas: RecusaProposta[] };
export type RespostaNascer = {
  dry_run: boolean; pode_confirmar: boolean;
  cartorio?: { tipo: string; ean: string; cod_cadastro: string; situacao: string }[];
  cartorio_erros?: { linha?: number; ean?: string; erro: string }[] | null;
  nascimento?: { problemas?: { linha?: number; erro?: string; aviso?: string }[] | null; nasceram?: number; alocacao_prevista?: unknown[] } | null;
};

export function lerPropostas(totais: unknown): PropostasCatalogo | null {
  const p = (totais as { propostas?: PropostasCatalogo } | null)?.propostas;
  return p && Array.isArray(p.cartorio) && Array.isArray(p.nascimentos) ? p : null;
}

/** Um nascimento selecionado arrasta as propostas de cartório do mesmo código (o par vem da aba 2, nunca do Catálogo). */
export function montarLoteNascimento(p: PropostasCatalogo, cartorioSel: Set<string>, nascSel: Set<string>) {
  const produtos = p.nascimentos.filter(n => nascSel.has(n.cod_cadastro));
  const codsNasc = new Set(produtos.map(n => n.cod_cadastro));
  const cartorio = p.cartorio.filter(c => cartorioSel.has(c.ean) || codsNasc.has(c.cod_cadastro));
  return {
    obrigatorias: new Set(p.cartorio.filter(c => codsNasc.has(c.cod_cadastro)).map(c => c.ean)),
    p_cartorio: cartorio.map(c => ({ tipo: c.tipo, ean: c.ean, cod_cadastro: c.cod_cadastro, inner_qtd: c.inner_qtd })),
    p_produtos: produtos.map(n => ({ cod_cadastro: n.cod_cadastro, ean: n.ean, inner_qtd: n.inner_qtd, nome_comercial: n.nome_comercial, origem: n.origem })),
  };
}

/** Recusas da prévia por linha, com o código do produto quando a linha é do nascimento. */
export function problemasDaPrevia(r: RespostaNascer, lote: ReturnType<typeof montarLoteNascimento>) {
  const out: { nivel: 'erro' | 'aviso'; texto: string }[] = [];
  for (const e of r.cartorio_erros ?? []) {
    const c = e.linha ? lote.p_cartorio[e.linha - 1] : undefined;
    out.push({ nivel: 'erro', texto: `Cartório${c ? ` · ${c.cod_cadastro}` : ''}${e.ean ? ` · EAN ${e.ean}` : ''}: ${e.erro}` });
  }
  for (const e of r.nascimento?.problemas ?? []) {
    const n = e.linha ? lote.p_produtos[e.linha - 1] : undefined;
    out.push({ nivel: e.erro ? 'erro' : 'aviso', texto: `Nascimento${n ? ` · ${n.cod_cadastro}` : ''}: ${e.erro ?? e.aviso}` });
  }
  return out;
}
