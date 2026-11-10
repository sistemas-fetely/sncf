import { distanciaEdicao, normalizarColecao } from './colecoesCatalogo';
export { kindDoCampo } from '../../../supabase/functions/_shared/catalogo-dimensao/campos';

export type CelulaDimensao = { id: string; campo: string; status: string; erro: string | null; valor_planilha: unknown };
export type GrupoDimensao<T = CelulaDimensao> = { chave: string; campo: string; nome: string; celulas: T[] };
export function agruparDimensoes<T extends CelulaDimensao>(celulas: T[]): GrupoDimensao<T>[] {
  const grupos = new Map<string, GrupoDimensao<T>>();
  for (const c of celulas) {
    if (c.status !== 'pendente' || !c.erro?.startsWith('Valor de dimensão não cadastrado') || typeof c.valor_planilha !== 'string' || !c.valor_planilha.trim()) continue;
    const nome = c.valor_planilha;
    const chave = JSON.stringify([c.campo, nome]);
    const g = grupos.get(chave) ?? { chave, campo: c.campo, nome, celulas: [] };
    g.celulas.push(c); grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => a.campo.localeCompare(b.campo) || a.nome.localeCompare(b.nome, 'pt-BR'));
}
export function coresParecidas(nome: string, cores: { nome: string }[]): string[] {
  const normalizado = normalizarColecao(nome);
  return [...new Set(cores.filter(c => distanciaEdicao(normalizado, normalizarColecao(c.nome)) <= 3).map(c => c.nome))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}