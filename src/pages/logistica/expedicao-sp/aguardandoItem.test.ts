import { describe, expect, it } from 'vitest';
import { faltantesValidos, itensPedidoPorSku } from './aguardandoItem';
describe('Mesa — falta de item', () => {
  const pedido = [{ sku: 'A', nome: 'Item A', quantidade: 10 }];
  it('exige motivo com ao menos 5 caracteres', () => {
    expect(faltantesValidos([{ sku: 'A', quantidade: 1 }],pedido,'1234')).toBe(false);
    expect(faltantesValidos([{ sku: 'A', quantidade: 1 }],pedido,'12345')).toBe(true);
  });
  it('exige ao menos um item', () => expect(faltantesValidos([],pedido,'12345')).toBe(false));
  it('exige quantidade positiva sem exceder o pedido', () => {
    expect(faltantesValidos([{ sku: 'A', quantidade: 0 }],pedido,'12345')).toBe(false);
    expect(faltantesValidos([{ sku: 'A', quantidade: 11 }],pedido,'12345')).toBe(false);
    expect(faltantesValidos([{ sku: 'A', quantidade: 10 }],pedido,'12345')).toBe(true);
  });
  it('recusa SKU fora do pedido', () => expect(faltantesValidos([{ sku: 'B', quantidade: 1 }],pedido,'12345')).toBe(false));
  it('soma linhas repetidas do pedido por SKU', () => {
    const base = { id:'i',sku:'A',descricao:'Item A',quantidade:5,ean:null,cod_cadastro:null };
    expect(itensPedidoPorSku([base,{ ...base,id:'j',quantidade:3 }])).toEqual([{ sku:'A',nome:'Item A',quantidade:8 }]);
  });
});