export type ColecaoDim = { codigo: string; rotulo: string; variantes: string[]; ativo: boolean };
export const normalizarColecao = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_\s]+/g, '');
export const slugColecao = (nome: string) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export function encontrarColecao(nome: string, colecoes: ColecaoDim[], somenteAtivas = true) {
  const n = normalizarColecao(nome);
  return n ? colecoes.find(c => (!somenteAtivas || c.ativo) && [c.rotulo, c.codigo, ...c.variantes].some(v => normalizarColecao(v) === n)) : undefined;
}
export function distanciaEdicao(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const linha = [i];
    for (let j = 1; j <= b.length; j++) linha[j] = Math.min(linha[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    anterior = linha;
  }
  return anterior[b.length];
}
export type CelulaColecao = { id: string; campo: string; status: string; tipo: string; cod_cadastro: string; valor_planilha: unknown };
export function colecaoNaoCadastrada(c: Pick<CelulaColecao, 'campo' | 'valor_planilha'>, colecoes: ColecaoDim[]) {
  return c.campo === 'colecao' && typeof c.valor_planilha === 'string' && !!normalizarColecao(c.valor_planilha) && !encontrarColecao(c.valor_planilha, colecoes);
}
export function detectarColecoesNovas(celulas: CelulaColecao[], colecoes: ColecaoDim[]) {
  const grupos = new Map<string, { nome: string; produtos: Set<string> }>();
  for (const c of celulas) {
    if (c.status !== 'pendente' || c.tipo === 'sem_cadastro' || !colecaoNaoCadastrada(c, colecoes) || typeof c.valor_planilha !== 'string') continue;
    const key = normalizarColecao(c.valor_planilha);
    const grupo = grupos.get(key) ?? { nome: c.valor_planilha, produtos: new Set<string>() };
    grupo.produtos.add(c.cod_cadastro); grupos.set(key, grupo);
  }
  return [...grupos.values()].map(g => {
    const n = normalizarColecao(g.nome);
    const proximas = colecoes.filter(c => c.ativo).map(c => ({ rotulo: c.rotulo, distancia: distanciaEdicao(n, normalizarColecao(c.rotulo)) })).filter(c => c.distancia <= 3).sort((a, b) => a.distancia - b.distancia || a.rotulo.localeCompare(b.rotulo));
    return { nome: g.nome, produtos: g.produtos.size, parecida: proximas[0]?.rotulo };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}