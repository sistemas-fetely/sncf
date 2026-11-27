/** Bounded parallel reads avoid a request per cell without flooding the database. */
export async function mapearLotes<T, R>(entradas: T[], tamanho: number, concorrencia: number, ler: (lote: T[]) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(tamanho) || tamanho < 1 || !Number.isInteger(concorrencia) || concorrencia < 1) throw new Error('Limites de lote inválidos.');
  const lotes: T[][] = [];
  for (let i = 0; i < entradas.length; i += tamanho) lotes.push(entradas.slice(i, i + tamanho));
  const resultados: R[] = new Array(lotes.length);
  let proximo = 0;
  await Promise.all(Array.from({ length: Math.min(concorrencia, lotes.length) }, async () => {
    while (proximo < lotes.length) { const i = proximo++; resultados[i] = await ler(lotes[i]); }
  }));
  return resultados;
}

export function camposDaLeitura(slugs: string[], ignorar: Set<string>, ficha: { campo: string; importavel_planilha?: boolean | null }[], somenteLeitura: (s: string) => boolean) {
  const presentes = new Set(slugs);
  return ficha.filter(c => c.importavel_planilha && presentes.has(c.campo) && !ignorar.has(c.campo) && !somenteLeitura(c.campo));
}