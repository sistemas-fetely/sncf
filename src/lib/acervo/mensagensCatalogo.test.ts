import { describe, it, expect } from 'vitest';
import { agruparMensagens, ErroCatalogo, deveAtualizarLeitura } from './mensagensCatalogo';

describe('avisos de aplicação do catálogo', () => {
  it('agrupa 17 células com a mesma falha', () => {
    expect(agruparMensagens(Array(17).fill('Mudança não está pendente na última leitura.'))).toBe('17 células: Mudança não está pendente na última leitura.');
  });
  it('limita a cinco motivos e conta os restantes', () => {
    expect(agruparMensagens(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'])).toBe('2 células: A; 1 célula: B; 1 célula: C; 1 célula: D; 1 célula: E; +2 outros motivos');
  });
  it('409 de leitura limpa seleção e atualiza, mas aplicação ocupada não', () => {
    expect(deveAtualizarLeitura(new ErroCatalogo('ocupada', 409, 'leitura_em_andamento'))).toBe(true);
    expect(deveAtualizarLeitura(new ErroCatalogo('nova', 409, 'leitura_mais_nova'))).toBe(true);
    expect(deveAtualizarLeitura(new ErroCatalogo('ocupada', 409, 'aplicacao_em_andamento'))).toBe(false);
    expect(deveAtualizarLeitura(new ErroCatalogo('erro', 502, 'leitura_mais_nova'))).toBe(false);
  });
});