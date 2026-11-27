import { describe, it, expect } from 'vitest';
import { estadoLeituraCatalogo } from '@/lib/acervo/estadoLeituraCatalogo';
const leitura = { id: 'v2', status: 'comparada', lida_em: '2026-11-27T20:47:05Z', totais: { v2: true, avisos: ['Colunas de loja ainda não são gravadas'] } };
describe('estado da leitura vigente', () => {
  it('distingue andamento de falha mesmo com status legado erro', () => {
    expect(estadoLeituraCatalogo({ ...leitura, status: 'erro', erro: null, totais: { em_andamento: true } })).toMatchObject({ lendo: true, inicio: leitura.lida_em, erro: null });
  });
  it('preserva a falha inteira da última leitura', () => {
    expect(estadoLeituraCatalogo({ ...leitura, status: 'erro', erro: 'Falha do servidor: detalhe completo' }, leitura).erro).toBe('Falha do servidor: detalhe completo');
  });
  it('leva v2 e avisos da referência quando o arquivo não mudou', () => {
    expect(estadoLeituraCatalogo({ ...leitura, id: 'hoje', status: 'sem_mudanca', totais: { leitura_referencia: 'v2' } }, leitura)).toMatchObject({ v2: true, avisos: ['Colunas de loja ainda não são gravadas'] });
  });
  it('não confunde v1 com v2', () => {
    expect(estadoLeituraCatalogo({ ...leitura, totais: {} }).v2).toBe(false);
  });
});