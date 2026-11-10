import { resolverCodigoBarras, unidadesCodigoBarras, type CodigoBarrasResolvido, type IndiceBarras } from "./resolverCodigoBarras";

export interface ProdutoRetorno {
  sku: string;
  cod: string | null;
  nome: string | null;
  dun?: string;
  innerQtd?: number | null;
}

/** Compatibility adapter: all lookup and GTIN rules live in the shared resolver. */
export function resolverCodigoRetorno(codigo: string, indice: IndiceBarras): ProdutoRetorno | null {
  return resolverCodigoBarras(codigo, indice);
}

/** Null means an explicit total of units is required before adding anything. */
export function unidadesBipeRetorno(produto: ProdutoRetorno, qtd: number): number | null {
  return unidadesCodigoBarras({ ...produto, tipo: produto.dun ? "dun" : "sku" } as CodigoBarrasResolvido, qtd);
}

export function origemDunRetorno(produto: ProdutoRetorno): string | undefined {
  if (!produto.dun) return undefined;
  return unidadesBipeRetorno(produto, 1) != null
    ? `DUN · 1 cx = ${produto.innerQtd} un`
    : "DUN · unidades informadas";
}