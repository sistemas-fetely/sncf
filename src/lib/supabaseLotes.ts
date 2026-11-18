type RespostaLote<T> = { data: T[] | null; error: unknown };
type ConsultaLotes<T> = {
  order: (coluna: string) => ConsultaLotes<T>;
  range: (de: number, ate: number) => PromiseLike<RespostaLote<T>>;
};

/** A ordenação deve terminar em uma chave única para manter os lotes estáveis. */
export async function buscarTodos<T>(
  queryBuilderFactory: () => ConsultaLotes<T>,
  ordenacao: readonly [string, ...string[]],
  lote = 1000,
): Promise<T[]> {
  if (!Number.isInteger(lote) || lote < 1 || lote > 1000) {
    throw new Error("O lote deve ser um inteiro entre 1 e 1000.");
  }
  if (!ordenacao.length || ordenacao.some(coluna => !coluna.trim())) {
    throw new Error("A consulta em lotes exige ordenação estável.");
  }
  const todos: T[] = [];
  for (let de = 0; ; de += lote) {
    let query = queryBuilderFactory();
    for (const coluna of ordenacao) query = query.order(coluna);
    const { data, error } = await query.range(de, de + lote - 1);
    if (error) throw error;
    todos.push(...(data ?? []));
    if (!data || data.length < lote) return todos;
  }
}