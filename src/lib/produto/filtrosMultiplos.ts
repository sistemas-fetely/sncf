import { lerLista } from "@/lib/navegacao/codecUrl";

export type CampoProduto = "colecao" | "grupo" | "fase";
export type SelecaoProduto = Partial<Record<CampoProduto, string[]>>;
export type DimensoesProduto = Partial<Record<CampoProduto, string | null>>;

/** Preserva links antigos e não normaliza uma seleção explícita completa. */
export function lerFiltroProduto(valor: string): string[] {
  return ["todos", "todas", "__todas"].includes(valor) ? [] : lerLista(valor);
}

/** IN em cada dimensão; dimensões combinadas por E. */
export function filtrarDimensoesProduto<T extends DimensoesProduto>(
  linhas: T[], selecao: SelecaoProduto, outros: (linha: T) => boolean = () => true,
  ignorar?: CampoProduto,
): T[] {
  return linhas.filter(linha => outros(linha) &&
    (Object.entries(selecao) as [CampoProduto, string[]][]).every(([campo, valores]) =>
      campo === ignorar || !valores.length || (linha[campo] != null && valores.includes(linha[campo])),
    ));
}

/** Opções permanecem visíveis com zero; duplicatas de produto não inflacionam contagens. */
export function opcoesFiltroProduto<T extends DimensoesProduto>(
  linhas: T[], selecao: SelecaoProduto, campo: CampoProduto, valores: string[],
  outros: (linha: T) => boolean = () => true,
  identidade?: (linha: T) => string,
  rotulo: (valor: string) => string = valor => valor,
) {
  const contagens = new Map<string, Set<string | T>>();
  for (const linha of filtrarDimensoesProduto(linhas, selecao, outros, campo)) {
    const valor = linha[campo];
    if (valor == null) continue;
    const itens = contagens.get(valor) ?? new Set<string | T>();
    itens.add(identidade ? identidade(linha) : linha);
    contagens.set(valor, itens);
  }
  return valores.map(valor => ({ valor, rotulo: rotulo(valor), contagem: contagens.get(valor)?.size ?? 0 }));
}