import { describe, expect, it } from 'vitest';
import { resumoMarketplace, estimativaDifere, dataLiberacaoMarketplace, type RecebivelMarketplace } from './recebivelMarketplace';
const linha = (patch: Partial<RecebivelMarketplace>): RecebivelMarketplace => ({
  venda_id: '1', conta_rotulo: 'MP-Meli', source_id: '189009599161', order_id: '2000019609511798', pack_id: null,
  data_venda: '2026-11-17', sku: null, descricao_item: null, valor_bruto: 67.47, comissao: 5.74, frete: 19.44,
  taxa_financiamento: 6.58, impostos: 0, tarifa_total: 31.76, valor_liquido: 35.71,
  data_liberacao_prevista: '2026-12-16', pedido_id: 'p4', pedido_ref: 'ML-0004', movimentacao_id: null,
  data_liberacao: null, valor_liberado: null, status: 'a_liberar', ...patch,
});
describe('Marketplace financeiro', () => {
  it('totaliza as seis vendas reais sem arredondamento residual', () => {
    expect(resumoMarketplace([9.37, 17.60, 55.72, 35.71, 35.71, 11.40].map(valor_liquido => linha({ valor_liquido })), '2026-11'))
      .toEqual({ aLiberar: 165.51, vendas: 6, liberadoMes: 0, semPedido: 0 });
  });
  it('liberado no mês usa valor liberado e data efetiva, não líquido nem previsão', () => {
    expect(resumoMarketplace([linha({ status: 'liberado', data_liberacao: '2026-11-19', valor_liberado: 30 }), linha({ status: 'liberado', data_liberacao: '2026-10-19', valor_liberado: 20 })], '2026-11').liberadoMes).toBe(30);
  });
  it('conta vendas sem pedido separadamente', () => {
    expect(resumoMarketplace([linha({ status: 'sem_pedido' })], '2026-11')).toEqual({ aLiberar: 0, vendas: 0, liberadoMes: 0, semPedido: 1 });
  });
  it('usa a data prevista de ML-0004 até a liberação', () => {
    expect(dataLiberacaoMarketplace(linha({}))).toBe('2026-12-16');
    expect(dataLiberacaoMarketplace(linha({ status: 'liberado', data_liberacao: '2026-12-17' }))).toBe('2026-12-17');
  });
  it('só destaca diferenças superiores a cinco centavos', () => {
    expect(estimativaDifere(5.74, 5.79)).toBe(false);
    expect(estimativaDifere(5.74, 5.80)).toBe(true);
    expect(estimativaDifere(null, 5.80)).toBe(false);
    expect(estimativaDifere(0, 0.06)).toBe(true);
  });
});