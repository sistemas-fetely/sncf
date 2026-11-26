// Limitador de ritmo do Bling: no máximo 1 chamada a cada `intervaloMs`, contando do INÍCIO da anterior.
// Se a chamada anterior já levou mais que o intervalo, não dorme. Seguro com várias tarefas concorrentes.
export function criarRitmo(intervaloMs = 350, agora: () => number = Date.now, dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
  let proximo = 0;
  return async () => {
    const t = agora();
    const inicio = Math.max(t, proximo);
    proximo = inicio + intervaloMs;
    if (inicio > t) await dormir(inicio - t);
  };
}
/** Roda `fn` sobre os itens com até `n` em paralelo, preservando a ordem do resultado. */
export async function emParalelo<T, R>(itens: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(itens.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]); } }));
  return out;
}
