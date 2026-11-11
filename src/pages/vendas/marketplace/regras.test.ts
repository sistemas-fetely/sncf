import { describe, it, expect } from 'vitest';
import { filtrarPedidos, valorTransporte, hojeSaoPaulo, exigirSucesso } from './regras';
const filtros = { marketplace: 'todos', estagio: 'todos', semTransportadora: false, semCusto: false, busca: '' };
const pedidos = [
  { id_externo: 'TIK-0001', marketplace_codigo: 'TIK', estagio: 'pre_faturamento', transportadora_id: null, custo_transporte: null, cliente_nome: 'Maria', numero_marketplace: '123' },
  { id_externo: 'ML-0001', marketplace_codigo: 'ML', estagio: 'entregue', transportadora_id: 'portador', custo_transporte: 0, cliente_nome: 'Ana', numero_marketplace: '456' },
  { id_externo: 'SPE-0001', marketplace_codigo: 'SPE', estagio: 'entregue', transportadora_id: 'portador', custo_transporte: 20, cliente_nome: 'João', numero_marketplace: '789' },
];
describe('Marketplace transporte', () => {
  it('filtra marketplace', () => expect(filtrarPedidos(pedidos, { ...filtros, marketplace: 'TIK' }).map(p => p.id_externo)).toEqual(['TIK-0001']));
  it('filtra estágio', () => expect(filtrarPedidos(pedidos, { ...filtros, estagio: 'entregue' })).toHaveLength(2));
  it('sem transportadora não depende de custo', () => expect(filtrarPedidos(pedidos, { ...filtros, semTransportadora: true }).map(p => p.id_externo)).toEqual(['TIK-0001']));
  it('sem custo inclui ausente e zero', () => expect(filtrarPedidos(pedidos, { ...filtros, semCusto: true }).map(p => p.id_externo)).toEqual(['TIK-0001', 'ML-0001']));
  it('valor opcional permanece null', () => expect(valorTransporte('')).toBeNull());
  it('converte reais e preserva zero', () => { expect(valorTransporte('1.234,56')).toBe(1234.56); expect(valorTransporte('0')).toBe(0); });
  it('recusa valor inválido', () => expect(() => valorTransporte('abc')).toThrow());
  it('data segue São Paulo', () => expect(hojeSaoPaulo(new Date('2026-11-11T00:33:00Z'))).toBe('2026-11-10'));
  it('propaga erro da RPC', () => expect(() => exigirSucesso({ ok: false, erro: 'Portador inválido' })).toThrow('Portador inválido'));
});