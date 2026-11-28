export type LeituraReferenciada = { id: string; status: string; totais: unknown };

/** Follow unchanged downloads to their content, preserving applied readings. */
export async function resolverLeituraConteudo<T extends LeituraReferenciada>(
  leitura: T,
  buscar: (id: string) => Promise<T | null>,
): Promise<T> {
  const vistos = new Set<string>();
  let atual = leitura;
  while (atual.status === 'sem_mudanca') {
    if (vistos.has(atual.id)) throw new Error('Referência circular na leitura do catálogo.');
    vistos.add(atual.id);
    const id = (atual.totais as { leitura_referencia?: unknown } | null)?.leitura_referencia;
    if (typeof id !== 'string' || !id) throw new Error('Leitura sem mudança sem referência de conteúdo.');
    const proxima = await buscar(id);
    if (!proxima) throw new Error(`Leitura de referência não encontrada: ${id}`);
    atual = proxima;
  }
  if (!['comparada', 'aplicada', 'aplicada_parcial'].includes(atual.status)) {
    throw new Error(`Referência de catálogo sem conteúdo concluído: ${atual.status}`);
  }
  return atual;
}