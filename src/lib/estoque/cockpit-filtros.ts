export const SEM_GRUPO = "__sem_grupo__";

export interface ProdutoFiltroCockpit {
  sku: string | null;
  cod_cadastro: string | null;
  nome_comercial: string | null;
  cor_nome: string | null;
  fase: string | null;
  grupo: string | null;
  colecao: string | null;
  centro: string | null;
  situacao: string | null;
}

export interface FiltrosCockpit {
  busca: string;
  fase: string;
  grupos: string[];
  colecoes: string[];
  centro: string;
  situacao: string;
}

export function filtrarCockpit<T extends ProdutoFiltroCockpit>(linhas: T[], filtros: FiltrosCockpit): T[] {
  const busca = filtros.busca.trim().toLowerCase();
  return linhas.filter((linha) =>
    (filtros.fase === "todos" || linha.fase === filtros.fase) &&
    (!filtros.grupos.length || filtros.grupos.includes(linha.grupo ?? SEM_GRUPO)) &&
    (!filtros.colecoes.length || (linha.colecao !== null && filtros.colecoes.includes(linha.colecao))) &&
    (filtros.centro === "todos" || linha.centro === filtros.centro) &&
    (filtros.situacao === "todos" || linha.situacao === filtros.situacao) &&
    (!busca || [linha.sku, linha.cod_cadastro, linha.nome_comercial, linha.cor_nome]
      .some((valor) => (valor ?? "").toLowerCase().includes(busca))),
  );
}

/** Uma opção conta produtos, não as linhas repetidas por centro; ignora só seu próprio filtro. */
export function contarOpcoesCockpit(
  linhas: ProdutoFiltroCockpit[], filtros: FiltrosCockpit, campo: "grupo" | "colecao",
): Map<string, number> {
  const recorte = filtrarCockpit(linhas, { ...filtros, ...(campo === "grupo" ? { grupos: [] } : { colecoes: [] }) });
  const produtos = new Map<string, Set<string>>();
  for (const linha of recorte) {
    const valor = campo === "grupo" ? linha.grupo ?? SEM_GRUPO : linha.colecao;
    if (valor === null) continue;
    const conjunto = produtos.get(valor) ?? new Set<string>();
    conjunto.add(linha.sku ?? linha.cod_cadastro ?? "");
    produtos.set(valor, conjunto);
  }
  return new Map([...produtos].map(([valor, conjunto]) => [valor, conjunto.size]));
}