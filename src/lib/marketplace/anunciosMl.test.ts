import { describe, expect, it } from 'vitest';
import { contarRecortes, precoDiferente, recorteDoAnuncio, type AnuncioMl } from './anunciosMl';
describe('recorte do anúncio ML', () => {
  it('sem SKU é vínculo quebrado mesmo ativo', () => expect(recorteDoAnuncio({ sku: null, situacao: 1 })).toBe('vinculo_quebrado'));
  it('3 e 5 são pausados', () => { expect(recorteDoAnuncio({ sku: 'X', situacao: 3 })).toBe('pausado'); expect(recorteDoAnuncio({ sku: 'X', situacao: 5 })).toBe('pausado'); });
  it('1 anunciado, 4 encerrado, 2 revisão', () => {
    expect(recorteDoAnuncio({ sku: 'X', situacao: 1 })).toBe('anunciado');
    expect(recorteDoAnuncio({ sku: 'X', situacao: 4 })).toBe('encerrado');
    expect(recorteDoAnuncio({ sku: 'X', situacao: 2 })).toBe('revisao');
  });
  it('preço diferente a partir de 1 centavo, só com SKU e varejo', () => {
    expect(precoDiferente({ sku: 'X', preco: 24.9, preco_varejo: 24.9 })).toBe(false);
    expect(precoDiferente({ sku: 'X', preco: 24.91, preco_varejo: 24.9 })).toBe(true);
    expect(precoDiferente({ sku: null, preco: 10, preco_varejo: 20 })).toBe(false);
    expect(precoDiferente({ sku: 'X', preco: 10, preco_varejo: null })).toBe(false);
  });
  it('preço diferente conta por cima da situação', () => {
    const a = (recorte: string, preco_diferente: boolean) => ({ recorte, preco_diferente }) as AnuncioMl;
    const c = contarRecortes([a('anunciado', true), a('pausado', true), a('vinculo_quebrado', false)], 7);
    expect(c).toMatchObject({ anunciado: 1, pausado: 1, vinculo_quebrado: 1, preco_diferente: 2, sem_anuncio: 7 });
  });
});
