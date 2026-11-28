import { lerPropostas } from './nascimentoCatalogo';

export type AbaConciliacao = 'novos' | 'ajustes' | 'saida';
export function resolverAbaConciliacao(aba: string | null, hash: string, pendencias: number, divergencias: number): AbaConciliacao {
  if (aba === 'novos' || aba === 'ajustes' || aba === 'saida') return aba;
  if (aba === 'entrada' || hash === '#atualizacao-do-dia') return 'ajustes';
  return divergencias > 0 && pendencias === 0 ? 'saida' : 'ajustes';
}

export function contadoresConciliacao(totais: unknown, pendencias: number, divergencias: number, pendenciasCadastro = 0) {
  const propostas = lerPropostas(totais);
  return {
    novos: (propostas?.nascimentos.length ?? 0) + (propostas?.cartorio.length ?? 0),
    ajustes: pendencias + pendenciasCadastro, ajustesMudancas: pendencias, ajustesPendencias: pendenciasCadastro,
    saida: divergencias,
  };
}