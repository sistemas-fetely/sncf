import { describe, it, expect } from 'vitest';
import { filtrarPedidos, valorTransporte, hojeSaoPaulo, exigirSucesso, podeAbrirDevolucao, podeIrMesaSp, normalizarEstagioMarketplace, podeAgendarMarketplace, temAlertaMarketplace, amanhaMarketplace, dataAgendamentoValida } from './regras';
const filtros = { marketplace: 'todos', estagio: 'todos', semTransportadora: false, semCusto: false, busca: '' };
const pedidos = [
  { id_externo: 'TIK-0001', marketplace_codigo: 'TIK', estagio: 'pre_faturamento', transportadora_id: null, custo_transporte: null, cliente_nome: 'Maria', numero_marketplace: '123' },
  { id_externo: 'ML-0001', marketplace_codigo: 'ML', estagio: 'entregue', transportadora_id: 'portador', custo_transporte: 0, cliente_nome: 'Ana', numero_marketplace: '456' },
  { id_externo: 'SPE-0001', marketplace_codigo: 'SPE', estagio: 'entregue', transportadora_id: 'portador', custo_transporte: 20, cliente_nome: 'João', numero_marketplace: '789' },
];
describe('Marketplace transporte', () => {
  it.each(['recebido', 'pre_faturamento', 'agendado'])('permite agendar %s', estagio => expect(podeAgendarMarketplace(estagio)).toBe(true));
  it.each(['faturado', 'em_separacao', 'em_transporte', 'entregue', 'cancelado', null])('não permite agendar %s', estagio => expect(podeAgendarMarketplace(estagio)).toBe(false));
  it('mínimo amanhã, nunca hoje ou passado', () => {
    const agora = new Date('2026-11-16T20:25:00Z');
    expect(amanhaMarketplace(agora)).toBe('2026-11-17');
    expect(dataAgendamentoValida('2026-11-16', agora)).toBe(false);
    expect(dataAgendamentoValida('2026-11-15', agora)).toBe(false);
    expect(dataAgendamentoValida('2026-11-17', agora)).toBe(true);
    expect(amanhaMarketplace(new Date('2026-12-31T20:25:00Z'))).toBe('2027-01-01');
  });
  it('agendado não conta SLA nem entra no filtro de alertas', () => {
    const agendado = { ...pedidos[0], estagio: 'agendado', alerta: 'SLA' };
    expect(temAlertaMarketplace(agendado)).toBe(false);
    expect(temAlertaMarketplace({ ...agendado, estagio: 'pre_faturamento' })).toBe(true);
    expect(filtrarPedidos([agendado], { ...filtros, comAlerta: true })).toEqual([]);
    expect(filtrarPedidos([agendado], { ...filtros, estagio: 'agendado' })).toEqual([agendado]);
  });
  it('devolução em transporte ou entregue', () => { for (const estagio of ['em_transporte', 'entregue']) expect(podeAbrirDevolucao({ estagio, devolucao_numero: null, devolucao_status: null })).toBe(true); expect(podeAbrirDevolucao({ estagio: 'pre_faturamento', devolucao_numero: null, devolucao_status: null })).toBe(false); });
  it('devolução viva impede outra; cancelada permite', () => { expect(podeAbrirDevolucao({ estagio: 'entregue', devolucao_numero: 'DEV-1', devolucao_status: 'concluida' })).toBe(false); expect(podeAbrirDevolucao({ estagio: 'entregue', devolucao_numero: 'DEV-1', devolucao_status: 'cancelada' })).toBe(true); });
  it.each(['faturado', 'pre_separacao', 'em_separacao'])('Mesa SP permite %s apenas com CD fora XPM-SC', estagio => {
    expect(podeIrMesaSp({ estagio, cd_codigo: 'SITE-SP' })).toBe(true);
    expect(podeIrMesaSp({ estagio, cd_codigo: 'XPM-SC' })).toBe(false);
    expect(podeIrMesaSp({ estagio, cd_codigo: null })).toBe(false);
  });
  it.each(['pre_faturamento', 'em_transporte', 'entregue', 'devolvido', 'cancelado', 'encerrado', 'travado'])('Mesa SP não permite %s', estagio => {
    expect(podeIrMesaSp({ estagio, cd_codigo: 'SITE-SP' })).toBe(false);
  });
  it('link aguardando_nf aponta para pre_faturamento e preserva o filtro real', () => {
    expect(normalizarEstagioMarketplace('aguardando_nf')).toBe('pre_faturamento');
    expect(filtrarPedidos(pedidos, { ...filtros, estagio: 'aguardando_nf' }).map(p => p.id_externo)).toEqual(['TIK-0001']);
  });
  it('link no_cd limpa o filtro', () => {
    expect(normalizarEstagioMarketplace('no_cd')).toBe('todos');
    expect(filtrarPedidos(pedidos, { ...filtros, estagio: 'no_cd' })).toHaveLength(3);
  });
  it('devolucao antiga aponta para devolvido', () => expect(normalizarEstagioMarketplace('devolucao')).toBe('devolvido'));

  it('alerta filtra pela presença não nula', () => expect(filtrarPedidos([{ ...pedidos[0], alerta: 'Falha' }, { ...pedidos[1], alerta: null }], { ...filtros, comAlerta: true })).toHaveLength(1));
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