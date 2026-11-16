import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgendarMarketplace } from './useMarketplace';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), user: { id: 'operador-logado' } as { id: string } | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return { invalidate, ...renderHook(useAgendarMarketplace, { wrapper }) };
}
describe('agendamento Marketplace', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'operador-logado' }; });
  it('envia pedido, data civil e operador logado e aguarda atualização', async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    const { result, invalidate, unmount } = setup();
    let release = () => {};
    invalidate.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    await act(async () => {
      let concluido = false;
      const operacao = result.current.mutateAsync({ pedidoId: 'pedido-1', data: '2026-12-14' }).then(() => { concluido = true; });
      await vi.waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['marketplace'] }));
      expect(mocks.rpc).toHaveBeenCalledWith('fn_marketplace_agendar_pedido', { p_pedido_id: 'pedido-1', p_agendado_para: '2026-12-14', p_operador_id: 'operador-logado' });
      expect(concluido).toBe(false);
      release(); await operacao;
    });
    unmount();
  });
  it('preserva a exceção do banco, sem atualizar como sucesso', async () => {
    const erro = { message: 'Data de liberação precisa ser futura' };
    mocks.rpc.mockResolvedValue({ error: erro });
    const { result, invalidate, unmount } = setup();
    await act(async () => { await expect(result.current.mutateAsync({ pedidoId: 'pedido-1', data: '2026-11-16' })).rejects.toEqual(erro); });
    expect(invalidate).not.toHaveBeenCalled();
    unmount();
  });
  it('não executa sem usuário logado', async () => {
    mocks.user = null;
    const { result, unmount } = setup();
    await act(async () => { await expect(result.current.mutateAsync({ pedidoId: 'pedido-1', data: '2026-12-14' })).rejects.toThrow('Entre novamente'); });
    expect(mocks.rpc).not.toHaveBeenCalled();
    unmount();
  });
});