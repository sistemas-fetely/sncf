import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEmpurrarXpm } from "./useEmpurrarXpm";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toast: vi.fn(), invalidate: vi.fn(), token: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {}, functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/lib/pedidos/invalidarPedido", () => ({ invalidarPedido: mocks.invalidate }));
vi.mock("@/lib/pedidos/sessaoXpm", () => ({ tokenEnvioXpm: mocks.token }));

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return { client, ...renderHook(() => useEmpurrarXpm(), { wrapper }) };
}

describe("adoção no envio compartilhado XPM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockResolvedValue("test-token");
    mocks.invalidate.mockResolvedValue(undefined);
  });

  it("devolve adoção e aguarda atualização do pedido antes de resolver o diálogo", async () => {
    mocks.invoke.mockResolvedValue({ data: { sucesso: true, adotada: true, codigo_expedicao: "PED-2380", avisos: [] }, error: null });
    let release = () => {};
    mocks.invalidate.mockImplementation(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result, client, unmount } = setup();
    let completed = false;
    await act(async () => {
      const operation = result.current.mutateAsync({ pedido_id: "order" }).then((response) => { completed = true; return response; });
      await vi.waitFor(() => expect(mocks.invalidate).toHaveBeenCalledWith(client, "order"));
      expect(completed).toBe(false);
      release();
      expect(await operation).toMatchObject({ adotada: true, codigo_expedicao: "PED-2380" });
    });
    expect(mocks.invoke).toHaveBeenCalledOnce();
    unmount();
  });

  it("falha não resolve como sucesso e também atualiza o pedido", async () => {
    mocks.invoke.mockResolvedValue({ data: { sucesso: false, erro: "adoção recusada" }, error: null });
    const { result, client, unmount } = setup();
    await act(async () => { await expect(result.current.mutateAsync({ pedido_id: "order" })).rejects.toThrow("adoção recusada"); });
    expect(mocks.invalidate).toHaveBeenCalledWith(client, "order");
    expect(mocks.invoke).toHaveBeenCalledOnce();
    unmount();
  });
});