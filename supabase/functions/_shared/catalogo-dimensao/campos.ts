export type KindDimensao = 'cor' | 'colecao';
export function kindDoCampo(campo: string): KindDimensao {
  if (campo === 'cor' || campo === 'cor_nome') return 'cor';
  if (campo === 'colecao') return 'colecao';
  if (campo === 'grupo') throw new Error('Grupo exige categoria_id e não está disponível nesta versão.');
  throw new Error('Campo inválido. Aceitos: cor, cor_nome e colecao.');
}