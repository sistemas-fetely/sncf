export type KindDimensao = 'cor' | 'colecao';
export type KindAutomatica = KindDimensao | 'grupo';
export function kindDoCampo(campo: string): KindDimensao {
  if (campo === 'cor' || campo === 'cor_nome') return 'cor';
  if (campo === 'colecao') return 'colecao';
  if (campo === 'grupo') throw new Error('Grupo exige categoria_id e não está disponível nesta versão.');
  throw new Error('Campo inválido. Aceitos: cor, cor_nome e colecao.');
}
/** Automatic path only: grupo is accepted because the caller supplies the product's category. */
export function kindAutomaticoDoCampo(campo: string): KindAutomatica {
  return campo === 'grupo' ? 'grupo' : kindDoCampo(campo);
}