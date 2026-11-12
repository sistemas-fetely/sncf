export interface SaldoSiteSp {
  sku: string;
  nome_comercial: string | null;
  disponivel: number | null;
  reservado: number | null;
}
export interface ProdutoColecao { sku: string | null; colecao: string | null }
export interface EstoqueSiteSp extends SaldoSiteSp { colecao: string | null }

export function juntarColecoesSiteSp(saldos: SaldoSiteSp[], produtos: ProdutoColecao[], colecoes: { codigo: string; rotulo: string }[]): EstoqueSiteSp[] {
  const porSku = new Map(produtos.map((produto) => [produto.sku, produto.colecao]));
  const rotulos = new Map(colecoes.map((colecao) => [colecao.codigo, colecao.rotulo]));
  return saldos.map((saldo) => {
    const codigo = porSku.get(saldo.sku);
    return { ...saldo, colecao: codigo ? rotulos.get(codigo) ?? codigo : null };
  });
}

export function filtrarEstoqueSiteSp(linhas: EstoqueSiteSp[], busca: string, colecoes: string[]) {
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  return linhas.filter((linha) => ((linha.disponivel ?? 0) > 0 || (linha.reservado ?? 0) > 0)
    && (!colecoes.length || (linha.colecao !== null && colecoes.includes(linha.colecao)))
    && (!termo || [linha.sku, linha.nome_comercial].some((texto) => texto?.toLocaleLowerCase("pt-BR").includes(termo))));
}