import { describe, expect, test } from 'bun:test';
import { chaveDimensao, criarAplicadorAutomatico } from '../_shared/catalogo-dimensao/automaticas.ts';
import { aplicarNoFop, type ItemFop, type ResultadoFop } from '../_shared/catalogo-planilha/aplicar-fop.ts';

const item = (id: string, nome: string, campo = 'cor'): ItemFop => ({ id, campo, cod_cadastro: id, valor_novo: nome, valor_esperado: null });
const ausente = (i: ItemFop): ResultadoFop => ({ id: i.id, status: 'erro', erro: `Valor de dimensão não cadastrado: ${i.campo} = ${i.valor_novo}` });

describe('dimensões automáticas estritas', () => {
  for (const [a, b] of [['Branco e Azul', 'Azul e Branco'], ['Éclat Oro', 'Oro Éclat'], ['Bianco & Oro', 'bianco e oro'], ['  Éclat   Oro ', 'oro e eclat']]) {
    test(`equivalência ${a} / ${b}`, () => expect(chaveDimensao(a)).toBe(chaveDimensao(b)));
  }
  for (const [a, b] of [['Prata', 'Preto'], ['Dourado', 'Bordo'], ['Rose', 'Rosa']]) {
    test(`nunca aproximar ${a} / ${b}`, () => expect(chaveDimensao(a)).not.toBe(chaveDimensao(b)));
  }
  test('grafia existente prevalece, cadastro idempotente e um valor para cor/cor_nome', async () => {
    const cadastros: string[] = [];
    const enviados: ItemFop[][] = [];
    const aplicar = criarAplicadorAutomatico({
      listar: async () => [{ kind: 'cor', nome: 'Azul & Branco' }],
      original: i => String(i.valor_novo),
      cadastrar: async (_campo, nome) => { cadastros.push(nome); return { nome }; },
      enviar: async itens => { enviados.push(structuredClone(itens)); return { resultados: itens.map(i => i.valor_novo === 'Azul & Branco' ? { id: i.id, status: 'aplicada' } : ausente(i)) }; },
    });
    await aplicar([item('1', 'Branco e Azul')]);
    await aplicar([item('2', 'azul e branco', 'cor_nome')]);
    expect(cadastros).toEqual(['Azul & Branco']);
    expect(enviados[3][0].valor_novo).toBe('Azul & Branco');
  });
  test('nova dimensão usa original exato, deduplica e mantém esperado e conflitos', async () => {
    const cadastros: string[] = [];
    let criado = false;
    const aplicar = criarAplicadorAutomatico({
      listar: async () => [], original: () => '  Éclat   Oro  ',
      cadastrar: async (_campo, nome) => { criado = true; cadastros.push(nome); return { nome }; },
      enviar: async itens => ({ resultados: itens.map(i => criado ? { id: i.id, status: 'conflito', valor_atual: 'Outro' } : ausente(i)) }),
    });
    const itens = [item('1', 'Éclat Oro'), item('2', 'Oro Éclat')];
    const r = await aplicar(itens) as { resultados: ResultadoFop[] };
    expect(cadastros).toEqual(['  Éclat   Oro  ']);
    expect(itens.map(i => i.valor_novo)).toEqual(['  Éclat   Oro  ', '  Éclat   Oro  ']);
    expect(itens.map(i => i.valor_esperado)).toEqual([null, null]);
    expect(r.resultados.map(r => r.status)).toEqual(['conflito', 'conflito']);
  });
  test('incompatibilidade e outros erros não acionam cadastro', async () => {
    const erros = ['cor e cor_nome incompatíveis nesta chamada', 'Campo inválido'];
    let cadastros = 0;
    const aplicar = criarAplicadorAutomatico({ listar: async () => [], original: () => 'Branco', cadastrar: async () => { cadastros++; return { nome: 'Branco' }; }, enviar: async itens => ({ resultados: itens.map((i, n) => ({ id: i.id, status: 'erro', erro: erros[n] })) }) });
    expect(await aplicar([item('1', 'Branco'), item('2', 'Branco')])).toEqual({ resultados: erros.map((erro, n) => ({ id: String(n + 1), status: 'erro', erro })) });
    expect(cadastros).toBe(0);
  });
  test('reenvia produto inteiro para preservar a trava cor/cor_nome', async () => {
    const calls: ItemFop[][] = [];
    const aplicar = criarAplicadorAutomatico({ listar: async () => [], original: () => 'Branco', cadastrar: async () => ({ nome: 'Branco' }), enviar: async itens => {
      calls.push(itens);
      return { resultados: itens.map(i => calls.length === 1 && i.campo === 'cor_nome' ? ausente(i) : { id: i.id, status: 'erro', erro: 'cor e cor_nome incompatíveis nesta chamada' }) };
    } });
    await aplicar([item('1', 'Branco'), { ...item('2', 'Branco', 'cor_nome'), cod_cadastro: '1' }]);
    expect(calls[1].map(i => i.campo)).toEqual(['cor', 'cor_nome']);
  });
  test('fluxo completo só conclui depois do FOP, conservando dono e leitura', async () => {
    let cadastrado = false;
    const concluidas: string[][] = [];
    const aplicar = criarAplicadorAutomatico({ listar: async () => [], original: () => 'Prata', cadastrar: async () => { cadastrado = true; return { nome: 'Prata' }; }, enviar: async itens => ({ resultados: itens.map(i => cadastrado ? { id: i.id, status: 'aplicada' } : ausente(i)) }) });
    const i = item('1', 'Prata');
    const r = await aplicarNoFop([{ ...i, dono: 'produto', tipo: 'mudanca', status: 'pendente', leitura_id: 'leitura', valor_planilha: i.valor_novo, valor_sistema: null }], ['1'], 'leitura', { id: 'ator', nome: 'Teste' }, { chamarFop: c => aplicar(c.celulas), concluir: async ids => { expect(cadastrado).toBe(true); concluidas.push(ids); }, registrar: async () => { throw new Error('Não deve registrar erro'); } });
    expect(r.aplicadas).toBe(1);
    expect(concluidas).toEqual([['1']]);
  });
});