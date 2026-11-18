import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useReenviarBling } from "./useReenviarBling";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), invalidate: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/pedidos/invalidarPedido", () => ({ invalidarPedido: mocks.invalidate }));
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useReenviarBling(), { wrapper: ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.invalidate.mockResolvedValue(undefined); });
it("envia somente reenvio verificado e aguarda atualização", async () => {
  mocks.invoke.mockResolvedValue({ data: { sucesso: true, bling_id: 999 }, error: null });
  const { result, unmount } = setup();
  await act(async () => { expect(await result.current.mutateAsync({ pedido_id: "pedido", motivo: "Preço corrigido" })).toMatchObject({ bling_id: 999 }); });
  expect(mocks.invoke).toHaveBeenCalledWith("enviar-pedido-bling", { body: { acao: "reenviar", pedido_id: "pedido", motivo: "Preço corrigido" } });
  expect(mocks.invalidate).toHaveBeenCalledOnce(); unmount();
});
it("recusa conserva a mensagem real e atualiza a tela", async () => {
  mocks.invoke.mockResolvedValue({ data: null, error: { message: "generic", context: { json: async () => ({ erro: "Pedido ainda ativo no Bling (situação Em aberto). Cancele lá primeiro." }) } } });
  const { result, unmount } = setup();
  await act(async () => { await expect(result.current.mutateAsync({ pedido_id: "pedido", motivo: "Preço corrigido" })).rejects.toThrow("Cancele lá primeiro."); });
  expect(mocks.invalidate).toHaveBeenCalledOnce(); unmount();
});