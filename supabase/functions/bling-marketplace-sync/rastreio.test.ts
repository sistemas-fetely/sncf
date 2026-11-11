import { describe, it, expect } from 'bun:test';
import { entregaConcluida, extrairRastreio, lerObjetos, sincronizarRastreio } from './rastreio';
describe('Rastreio marketplace', () => {
  const agora = '2026-11-11T07:11:00.000Z';
  it('situação real 8 preserva etiqueta sem descrição e usa agora para data zerada', () => {
    const r = extrairRastreio({ data: { rastreamento: { codigo: 'ABC', situacao: 8, descricao: '', ultimaAlteracao: '0000-00-00 00:00:00' } } }, agora);
    expect(r).toMatchObject({ codigo_rastreio: 'ABC', status_atual: 'Etiqueta gerada', data_ultima_atualizacao: agora, atualizado_em: agora });
    expect(r).not.toHaveProperty('entregue');
  });
  it('situação real 1 registra encaminhamento sem confirmar entrega', () => {
    const r = extrairRastreio({ data: { rastreamento: { codigo: 'ABC', situacao: 1, descricao: 'Objeto encaminhado', ultimaAlteracao: '2026-11-10 12:18:40' } } }, agora);
    expect(r).toMatchObject({ status_atual: 'Objeto encaminhado', data_ultima_atualizacao: '2026-11-10T15:18:40.000Z' });
    expect(r).not.toHaveProperty('entregue');
  });
  it('situação real 3 confirma entrega com a data da última alteração', () => {
    expect(extrairRastreio({ data: { rastreamento: { codigo: 'ABC', situacao: 3, descricao: 'Objeto entregue ao destinatário', ultimaAlteracao: '2026-11-10 12:18:40', data: agora } } }, agora)).toMatchObject({ status_atual: 'Objeto entregue ao destinatário', entregue: true, entregue_fonte: 'marketplace', entregue_confirmado_em: '2026-11-10T15:18:40.000Z' });
  });
  it('situação 3 confirma entrega mesmo sem texto indicativo', () => {
    expect(extrairRastreio({ rastreamento: { codigo: 'ABC', situacao: 3, descricao: 'Concluído', ultimaAlteracao: '2026-11-10 12:18:40' } }, agora)).toMatchObject({ entregue: true, entregue_confirmado_em: '2026-11-10T15:18:40.000Z' });
  });
  it.each([[1, 'Em trânsito'], [3, 'Entregue'], [9, 'Situação Bling 9']])('situação %s sem descrição usa rótulo %s', (situacao, status) => {
    expect(extrairRastreio({ rastreamento: { codigo: 'ABC', situacao, descricao: '', ultimaAlteracao: '2026-11-10 12:18:40' } }, agora)).toMatchObject({ status_atual: status });
  });
  it('situação 3 com data zerada não inventa confirmação de entrega', () => {
    const r = extrairRastreio({ rastreamento: { codigo: 'ABC', situacao: 3, descricao: '', ultimaAlteracao: '0000-00-00 00:00:00' } }, agora);
    expect(r).toMatchObject({ status_atual: 'Entregue', data_ultima_atualizacao: agora });
    expect(r).not.toHaveProperty('entregue_confirmado_em');
  });
  it('formato real Bling usa ultimaAlteracao no horário brasileiro', () => expect(extrairRastreio({ data: { rastreamento: { codigo: 'ABC', descricao: 'Entregue', situacao: 1, ultimaAlteracao: '2026-11-10 12:18:40' } } }, '2026-11-11T02:00:00Z')).toMatchObject({ entregue: true, entregue_confirmado_em: '2026-11-10T15:18:40.000Z' }));
  it('limita 50 em transporte, registra cru e faz upsert por código', async () => {
    const writes: any[] = []; const filters: any[] = [];
    const sb = { from: (table: string) => {
      if (table === 'integracoes_sync_log') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'log' }, error: null }) }) }), update: (value: any) => ({ eq: async () => { writes.push({ table, value }); return { error: null }; } }) };
      if (table === 'vw_gestao_marketplace') { const q: any = { select: () => q, eq: (k: any,v: any) => { filters.push([k,v]); return q; }, order: () => q, limit: async (v: any) => { filters.push(['limit',v]); return { data: [{ pedido_id: 'p1', bling_pedido_id: '1' }], error: null }; } }; return q; }
      return { upsert: async (value: any, options: any) => { writes.push({ table, value, options }); return { error: null }; } };
    } };
    const raw = { data: { rastreamento: { codigo: 'ABC', descricao: 'Entregue', ultimaAlteracao: '2026-11-10 12:18:40' } } };
    const r = await sincronizarRastreio(sb, async path => path.includes('/pedidos/') ? { data: { transporte: { volumes: [{ id: 9 }] } } } : raw);
    expect(filters).toEqual([['estagio','em_transporte'],['limit',50]]);
    const upsert = writes.find(w => w.table === 'pedido_rastreamento'); expect(upsert.options.onConflict).toBe('codigo_rastreio'); expect(upsert.value).toMatchObject({ pedido_id: 'p1', entregue: true, entregue_fonte: 'marketplace' });
    expect(JSON.parse(writes[0].value.detalhes)[0].objetos[0].raw).toEqual(raw); expect(r.atualizados).toBe(1);
  });
  it('entrega concluída', () => expect(entregaConcluida('Objeto entregue ao destinatário')).toBe(true));
  it('saiu não confirma entrega', () => expect(entregaConcluida('Saiu para entrega')).toBe(false));
  it('rota não confirma entrega', () => expect(entregaConcluida('Em rota de entrega')).toBe(false));
  it('tentativa não confirma entrega', () => expect(entregaConcluida('Tentativa de entrega')).toBe(false));
  it('evento confirma fonte e data', () => expect(extrairRastreio({ data: { rastreamento: { codigo: 'ABC', situacao: 'Entregue', data: '2026-11-11T01:00:00Z' } } }, '2026-11-11T02:00:00Z')).toMatchObject({ codigo_rastreio: 'ABC', entregue: true, entregue_fonte: 'marketplace', entregue_confirmado_em: '2026-11-11T01:00:00.000Z' }));
  it('não inventa data de entrega', () => expect(extrairRastreio({ rastreamento: { codigo: 'ABC', descricao: 'Entregue' } }, '2026-11-11T02:00:00Z')).not.toHaveProperty('entregue'));
  it('não apaga confirmação anterior com evento em trânsito', () => expect(extrairRastreio({ rastreamento: { codigo: 'ABC', descricao: 'Saiu para entrega' } }, '2026-11-11T02:00:00Z')).not.toHaveProperty('entregue'));
  it('formato desconhecido não produz gravação', () => expect(extrairRastreio({ data: { id: 10 } }, '2026-11-11T02:00:00Z')).toBeNull());
  it('busca todos os volumes com GET e preserva cru', async () => {
    const caminhos: string[] = []; const raw = { data: { transporte: { volumes: [{ id: 1 }, { id: 2 }, { id: 1 }] } } };
    const r = await lerObjetos('123', async p => { caminhos.push(p); return p.includes('/pedidos/') ? raw : { data: { id: p } }; });
    expect(caminhos).toEqual(['/pedidos/vendas/123', '/logisticas/objetos/1', '/logisticas/objetos/2']); expect(r.pedido).toEqual(raw); expect(r.objetos).toHaveLength(2);
  });
});