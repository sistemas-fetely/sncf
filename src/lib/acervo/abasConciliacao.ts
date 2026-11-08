export type AbaConciliacao = 'entrada' | 'saida';
export function resolverAbaConciliacao(aba: string | null, hash: string, pendencias: number, divergencias: number): AbaConciliacao {
  if (aba === 'entrada' || aba === 'saida') return aba;
  if (hash === '#atualizacao-do-dia') return 'entrada';
  return divergencias > 0 && pendencias === 0 ? 'saida' : 'entrada';
}