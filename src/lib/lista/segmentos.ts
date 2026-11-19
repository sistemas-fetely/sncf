/** Resolve a página global sem trocar a ordem de blocos definida pela tela. */
export function recortarSegmentos<T>(segmentos: { chave: T; total: number }[], pagina: number, tamanho: number) {
  let inicio = (pagina - 1) * tamanho;
  let restante = tamanho;
  const recortes: { chave: T; inicio: number; quantidade: number }[] = [];
  for (const segmento of segmentos) {
    if (inicio >= segmento.total) { inicio -= segmento.total; continue; }
    const quantidade = Math.min(restante, segmento.total - inicio);
    if (quantidade > 0) recortes.push({ chave: segmento.chave, inicio, quantidade });
    restante -= quantidade;
    inicio = 0;
    if (restante === 0) break;
  }
  return recortes;
}