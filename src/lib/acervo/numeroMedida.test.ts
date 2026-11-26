import { describe, expect, it } from 'vitest';
import { campoDeMedida, numeroMedida } from './numeroMedida';

describe('numeroMedida', () => {
  it('0.0693 vira 0,0693', () => expect(numeroMedida(0.0693)).toBe('0,0693'));
  it('ruído de float 0.045700000000000005 vira 0,0457', () => expect(numeroMedida(0.045700000000000005)).toBe('0,0457'));
  it('inteiro 16 fica 16 sem casas decimais', () => expect(numeroMedida(16)).toBe('16'));
  it('4.6 vira 4,6', () => expect(numeroMedida(4.6)).toBe('4,6'));
  it('string de número puro também formata', () => expect(numeroMedida('0.0693')).toBe('0,0693'));
  it('até 1 casa decimal no peso: 234.7 vira 234,7', () => expect(numeroMedida(234.7, 1)).toBe('234,7'));
  it('1 casa sem zeros à direita: 235 fica 235', () => expect(numeroMedida(235, 1)).toBe('235'));
  it('1 casa arredonda 234.74 para 234,7', () => expect(numeroMedida(234.74, 1)).toBe('234,7'));
  it('texto não numérico devolve null', () => expect(numeroMedida('Fetély')).toBeNull());
  it('código com pontos não é número puro', () => expect(numeroMedida('3406.00.00')).toBeNull());
  it('nulo e indefinido devolvem null', () => {
    expect(numeroMedida(null)).toBeNull();
    expect(numeroMedida(undefined)).toBeNull();
  });
});

describe('campoDeMedida', () => {
  it('peso, medidas e preço são de medida', () => {
    for (const c of ['pesoBruto', 'pesoLiquido', 'altura', 'largura', 'profundidade', 'preco']) {
      expect(campoDeMedida(c)).toBe(true);
    }
  });
  it('identificação e contagem não são de medida', () => {
    for (const c of ['gtin', 'gtinEmbalagem', 'ncm', 'cest', 'marca', 'itensPorCaixa', 'unidadeMedida']) {
      expect(campoDeMedida(c)).toBe(false);
    }
  });
  it('campo ausente não é de medida', () => {
    expect(campoDeMedida(undefined)).toBe(false);
    expect(campoDeMedida(null)).toBe(false);
    expect(campoDeMedida('')).toBe(false);
  });
});
