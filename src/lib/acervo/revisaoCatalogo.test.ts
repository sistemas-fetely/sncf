import { describe, expect, it } from 'vitest';
import { agruparCatalogo, celulasSelecionadas, decisoesCatalogo, type CelulaCatalogo } from './revisaoCatalogo';
const celula = (id: string, codigo: string, campo: string, tipo = 'mudanca'): CelulaCatalogo => ({ id, cod_cadastro: codigo, campo, tipo, dono: 'operacoes', status: 'pendente', leitura_id: 'leitura', erro: null, escolha: null, resolvido_em: null, resolvido_por: null, valor_base: null, valor_sistema: 'a', valor_planilha: 'b' });
const dados = [celula('1','001','ncm'), celula('2','001','cest'), celula('3','002','ncm','conflito'), celula('4','002','cest','erro')];
describe('revisão por produto', () => {
  it('agrupa duas pendências em um produto e conta células', () => {
    const produtos = agruparCatalogo(dados, {}, { campo: 'todos', tipo: 'todos', busca: '' });
    expect(produtos).toHaveLength(2);
    expect(celulasSelecionadas(produtos, new Set(['001']))).toHaveLength(2);
  });
  it('aplica somente NCM quando o filtro NCM está ativo', () => {
    const produtos = agruparCatalogo(dados, {}, { campo: 'ncm', tipo: 'todos', busca: '' });
    expect(decisoesCatalogo(celulasSelecionadas(produtos, new Set(['001'])), 'aplicar', {})).toEqual([{ ids: ['1'], acao: 'aplicar', escolha: 'planilha' }]);
  });
  it('selecionar todos do filtro de tipo não inclui outras células', () => {
    const produtos = agruparCatalogo(dados, {}, { campo: 'todos', tipo: 'conflito', busca: '' });
    expect(celulasSelecionadas(produtos, new Set(produtos.map(p => p.codigo))).map(c => c.id)).toEqual(['3']);
  });
  it('busca por nome e código', () => {
    expect(agruparCatalogo(dados, { '001': 'Vela Lumier' }, { campo: 'todos', tipo: 'todos', busca: 'lumier' }).map(p => p.codigo)).toEqual(['001']);
    expect(agruparCatalogo(dados, {}, { campo: 'todos', tipo: 'todos', busca: '002' }).map(p => p.codigo)).toEqual(['002']);
  });
  it('exige escolha e mantém as ações existentes de conflito e mudança', () => {
    expect(decisoesCatalogo(dados, 'aplicar', {})).toEqual([]);
    expect(decisoesCatalogo(dados, 'aplicar', { '3': 'sistema' })).toEqual([{ ids: ['1','2'], acao: 'aplicar', escolha: 'planilha' }, { ids: ['3'], acao: 'resolver', escolha: 'sistema' }]);
  });
  it('descarta três células, sem enviar erro ao resolver', () => {
    expect(decisoesCatalogo(dados, 'descartar', {})).toEqual([{ ids: ['1','2','3'], acao: 'descartar', escolha: 'sistema' }]);
  });
});