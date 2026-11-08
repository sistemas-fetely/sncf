import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSyncContato } from "./useSyncContato";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), single: vi.fn(), toast: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  functions: { invoke: mocks.invoke },
  from: () => ({ select: () => ({ eq: () => ({ single: mocks.single }) }) }),
} }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["parceiro-bling-check", "partner"], { bling_id: null });
  client.setQueryData(["pedido-detalhe", "order"], { pedido: { parceiro_id: "partner" } });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return { client, ...renderHook(() => useSyncContato(), { wrapper }) };
}

describe("sincronização do contato no detalhe do pedido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invoke.mockResolvedValue({ data: { sucesso: true, bling_id: "18193608916" }, error: null });
    mocks.single.mockResolvedValue({ data: { bling_id: "18193608916" }, error: null });
  });

  it("atualiza o ID e invalida o detalhe antes de informar sucesso", async () => {
    const { client, result } = setup();
    mocks.toast.mockImplementation(() => {
      expect(client.getQueryData(["parceiro-bling-check", "partner"])).toEqual({ bling_id: "18193608916" });
      expect(client.getQueryState(["pedido-detalhe", "order"])?.isInvalidated).toBe(true);
    });
    await act(async () => { await result.current.mutateAsync("partner"); });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Contato sincronizado no Bling" }));
  });

  it("não confirma sucesso nem esconde o aviso quando o ID não foi gravado", async () => {
    mocks.single.mockResolvedValue({ data: { bling_id: null }, error: null });
    const { client, result } = setup();
    await act(async () => { await expect(result.current.mutateAsync("partner")).rejects.toThrow("ID não foi gravado"); });
    expect(client.getQueryData(["parceiro-bling-check", "partner"])).toEqual({ bling_id: null });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Erro ao sincronizar contato" }));
  });

  it("propaga a falha de leitura sem informar sucesso", async () => {
    mocks.single.mockResolvedValue({ data: null, error: { message: "Falha de acesso ao parceiro" } });
    const { result } = setup();
    await act(async () => { await expect(result.current.mutateAsync("partner")).rejects.toThrow("Falha de acesso ao parceiro"); });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Falha de acesso ao parceiro" }));
  });

  it("mantém o aviso quando a sincronização é ignorada", async () => {
    mocks.invoke.mockResolvedValue({ data: { sucesso: false, ignorado: true, motivo: "sem_documento" }, error: null });
    const { client, result } = setup();
    await act(async () => { await result.current.mutateAsync("partner"); });
    expect(mocks.single).not.toHaveBeenCalled();
    expect(client.getQueryData(["parceiro-bling-check", "partner"])).toEqual({ bling_id: null });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sync ignorado" }));
  });
});