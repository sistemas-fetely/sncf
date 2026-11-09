import { describe, expect, it } from 'vitest';
import { filtrarCelulas, contarOpcoes, resumoSelecao, naturezaCelula, planoCatalogo, totaisPorBloco, agruparCatalogo, celulasSelecionadas, decisoesCatalogo, completarNomesCatalogo, valorSistemaVazio, type CelulaCatalogo } from './revisaoCatalogo';
const celula = (id: string, codigo: string, campo: string, tipo = 'mudanca'): CelulaCatalogo => ({ id, cod_cadastro: codigo, campo, tipo, dono: 'operacoes', status: 'pendente', leitura_id: 'leitura', erro: null, escolha: null, resolvido_em: null, resolvido_por: null, valor_base: null, valor_sistema: 'a', valor_planilha: 'b' });
const dados = [celula('1','001','ncm'), celula('2','001','cest'), celula('3','002','ncm','conflito'), celula('4','002','cest','erro')];
describe('revisão por produto', () => {
  it('resolve o nome da mesma leitura mesmo pertencendo a Produto e já aplicado', () => {
    const nome = { ...celula('nome','001','nome_comercial'), dono: 'produto', status: 'aplicada', valor_planilha: 'Prato Vermelho' };
    expect(completarNomesCatalogo({ '001': '' }, [nome])['001']).toBe('Prato Vermelho (planilha)');
    expect(completarNomesCatalogo({ '001': 'Nome SNCF' }, [nome])['001']).toBe('Nome SNCF');
  });
  it('considera nulo e texto vazio como novo, preservando zero e false como valores existentes', () => {
    expect([null, undefined, '', '  '].every(valorSistemaVazio)).toBe(true);
    expect([0, false, '4823.69.00'].some(valorSistemaVazio)).toBe(false);
  });
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
  const prod = (id: string, codigo: string, campo: string, tipo = 'mudanca'): CelulaCatalogo => ({ ...celula(id, codigo, campo, tipo), dono: 'produto' });
  const misto = [celula('1','001','ncm'), prod('p1','001','categoria'), prod('p2','002','colecao','conflito'), prod('p3','002','grupo','conflito')];
  const blocos = { ncm: 'fiscal_fisico', categoria: 'classificacao', colecao: 'classificacao', grupo: 'classificacao' };
  it('mostra os dois donos juntos e filtra por bloco', () => {
    expect(agruparCatalogo(misto, {}, { campo: 'todos', tipo: 'todos', busca: '' }).flatMap(p => p.celulas.map(c => c.id))).toEqual(['1', 'p1', 'p2', 'p3']);
    expect(agruparCatalogo(misto, {}, { campo: 'todos', tipo: 'todos', busca: '', bloco: 'fiscal_fisico' }, blocos).flatMap(p => p.celulas.map(c => c.id))).toEqual(['1']);
    expect(totaisPorBloco(misto, blocos)).toEqual({ fiscal_fisico: 1, classificacao: 3 });
  });
  it('separa por dono: fiscal no SNCF, produto no FOP', () => {
    expect(planoCatalogo(misto, 'aplicar', { p2: 'planilha', p3: 'planilha' })).toEqual({ sncf: [{ ids: ['1'], acao: 'aplicar', escolha: 'planilha', dono: 'operacoes' }], fop: ['p1', 'p2', 'p3'] });
  });
  it('conflito de Produto: sistema descarta sem FOP, planilha vai ao FOP', () => {
    expect(planoCatalogo(misto, 'aplicar', { p2: 'sistema', p3: 'planilha' })).toEqual({ sncf: [{ ids: ['1'], acao: 'aplicar', escolha: 'planilha', dono: 'operacoes' }, { ids: ['p2'], acao: 'resolver', escolha: 'sistema', dono: 'produto' }], fop: ['p1', 'p3'] });
  });
  it('conflito sem escolha bloqueia o plano inteiro', () => {
    expect(planoCatalogo(misto, 'aplicar', { p2: 'planilha' })).toEqual({ sncf: [], fop: [] });
  });
  it('descartar nunca chama o FOP', () => {
    expect(planoCatalogo(misto, 'descartar', {})).toEqual({ sncf: [{ ids: ['1'], acao: 'descartar', escolha: 'sistema', dono: 'operacoes' }, { ids: ['p1', 'p2', 'p3'], acao: 'descartar', escolha: 'sistema', dono: 'produto' }], fop: [] });
  });
  describe('filtros da Entrada', () => {
    const vazio = { ...celula('v','001','ncm'), valor_sistema: null };
    const cs = [vazio, prod('p1','001','categoria'), prod('p2','002','colecao'), celula('o2','002','ncm')];
    const info = { '001': { colecao: 'Colors Gold', linha: 'Lumier', fase: 'ativo' }, '002': { colecao: 'Pétale', linha: 'Célébrée', fase: 'pre_venda' } };
    const ctx = { nomes: {}, blocoDe: blocos, info };
    const base = { campo: 'todos', tipo: 'todos', busca: '' };
    it('natureza: vazio é preencher, valor existente é alterar', () => {
      expect(naturezaCelula(vazio)).toBe('preencher');
      expect(naturezaCelula(cs[1])).toBe('alterar');
      expect(filtrarCelulas(cs, { ...base, natureza: 'preencher' }, ctx).map(c => c.id)).toEqual(['v']);
    });
    it('combina coleção + bloco: só Fiscal da Colors Gold', () => {
      expect(filtrarCelulas(cs, { ...base, colecoes: 'Colors Gold', bloco: 'fiscal_fisico' }, ctx).map(c => c.id)).toEqual(['v']);
    });
    it('multiseleção de linha, fase e dono', () => {
      expect(filtrarCelulas(cs, { ...base, linhas: 'Lumier|Célébrée', dono: 'produto' }, ctx).map(c => c.id)).toEqual(['p1', 'p2']);
      expect(filtrarCelulas(cs, { ...base, fase: 'pre_venda' }, ctx).map(c => c.id)).toEqual(['p2', 'o2']);
    });
    it('contagem de cada opção respeita os outros filtros, não o próprio', () => {
      expect(contarOpcoes(cs, { ...base, colecoes: 'Colors Gold', dono: 'operacoes' }, ctx, 'colecoes')).toEqual({ 'Colors Gold': { produtos: 1, celulas: 1 }, 'Pétale': { produtos: 1, celulas: 1 } });
      expect(contarOpcoes(cs, { ...base, colecoes: 'Colors Gold' }, ctx, 'dono')).toEqual({ operacoes: { produtos: 1, celulas: 1 }, produto: { produtos: 1, celulas: 1 } });
    });
    it('rodapé separa Operações e Produto', () => {
      expect(resumoSelecao(cs)).toEqual({ produtos: 2, celulas: 4, operacoes: 2, produto: 2 });
    });
  });
});
