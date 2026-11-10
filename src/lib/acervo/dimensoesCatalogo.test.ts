import { describe, expect, it } from 'vitest';
import { agruparDimensoes, coresParecidas, kindDoCampo } from './dimensoesCatalogo';
import { cadastrarDimensao } from '../../../supabase/functions/catalogo-dimensao-cadastrar/cadastrar';
const c = (id: string, campo = 'cor', nome = 'Vermelho Coral') => ({ id, campo, valor_planilha: nome, status: 'pendente', erro: `Valor de dimensão não cadastrado: ${campo} = ${nome}` });
describe('dimensões do catálogo', () => {
  it.each([['cor', 'cor'], ['cor_nome', 'cor'], ['colecao', 'colecao']])('mapeia %s para %s', (campo, kind) => expect(kindDoCampo(campo)).toBe(kind));
  it('recusa grupo que exige categoria e campos desconhecidos', () => { expect(() => kindDoCampo('grupo')).toThrow('categoria_id'); expect(() => kindDoCampo('ncm')).toThrow('Campo inválido'); });
  it('agrupa por campo e valor exato sem misturar cor e cor_nome', () => {
    const r = agruparDimensoes([c('1'), c('2'), c('3', 'cor_nome'), c('4', 'cor', 'vermelho coral')]);
    expect(r).toHaveLength(3); expect(r.find(g => g.campo === 'cor' && g.nome === 'Vermelho Coral')?.celulas.map(c => c.id)).toEqual(['1', '2']);
  });
  it('exclui resolvidas e outros erros; preserva texto exato', () => {
    const r = agruparDimensoes([{ ...c('1'), status: 'aplicada' }, { ...c('2'), erro: 'Outro erro' }, c('3', 'cor', ' Azul Céu ')]);
    expect(r.map(g => g.nome)).toEqual([' Azul Céu ']);
  });
  it('avisa semelhantes ignorando acentos e caixa', () => { expect(coresParecidas('azul ceu', [{ nome: 'Azul Céu' }, { nome: 'Azul Céus' }, { nome: 'Vermelho Coral' }])).toEqual(['Azul Céu', 'Azul Céus']); });
  it('envia nome exato e audita só após sucesso', async () => {
    const ordem: string[] = [];
    await cadastrarDimensao('cor_nome', ' Azul Céu ', { id: 'u', nome: 'Pessoa' }, {
      chamarFop: async body => { ordem.push('fop'); expect(body).toEqual({ quem: { id: 'u', nome: 'Pessoa' }, kind: 'cor', nome: ' Azul Céu ' }); return { ok: true, kind: 'cor', nome: ' Azul Céu ', id: '1', criado: true }; },
      auditar: async () => { ordem.push('audit'); },
    }); expect(ordem).toEqual(['fop', 'audit']);
  });
  it('ok:false fica visível e não audita', async () => {
    await expect(cadastrarDimensao('cor', 'X', { id: 'u', nome: 'Pessoa' }, { chamarFop: async () => ({ ok: false, erro: 'FOP recusou' }), auditar: async () => { throw new Error('não deve auditar'); } })).rejects.toThrow('FOP recusou');
  });
});