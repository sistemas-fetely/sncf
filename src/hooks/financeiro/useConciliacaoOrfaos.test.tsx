import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QK_ORFAOS, useAtribuirOrfao } from "./useConciliacaoOrfaos";
import { QK_ORFAOS_RESOLVIDOS, useMarcarNaoRecebivel, useDesfazerNaoRecebivel } from "./useConciliacaoOrfaos";
import { supabase } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "operador" } } })) },
    rpc: vi.fn(async () => ({ data: { ok: true }, error: null })),
  },
}));

it("aceitar órfão atualiza provas, fila aguardando pagamento e cache específico do pedido sugerido", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData([QK_ORFAOS], [{ movimentacao_id: "entrada", pedido_sugerido_id: "pedido-2409" }]);
  const keys = [
    [QK_ORFAOS_RESOLVIDOS],
    ["prova-pagamento", "pedido-2409"],
    ["prova-pagamento-lote", ["pedido-2409"]],
    ["pedidos-fila", { estagio: "aguardando_pagamento" }],
    ["primeiro-pagamento-fila", null],
    ["mesa-comercial-contagem"],
    ["pedido-detalhe", "pedido-2409"],
    ["cache-especifico", "pedido-2409"],
  ];
  keys.forEach(key => qc.setQueryData(key, "anterior"));
  const { result, unmount } = renderHook(() => useAtribuirOrfao(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  await act(async () => {
    await result.current.mutateAsync({ movimentacao_id: "entrada", parceiro_id: "cliente" });
  });
  keys.forEach(key => expect(qc.getQueryState(key)?.isInvalidated).toBe(true));
  unmount();
  qc.clear();
});

it("tirar da fila passa os parâmetros exatos e atualiza fila e resolvidos", async () => {
  const qc = new QueryClient();
  qc.setQueryData([QK_ORFAOS], []);
  qc.setQueryData([QK_ORFAOS_RESOLVIDOS], []);
  const { result, unmount } = renderHook(() => useMarcarNaoRecebivel(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  await act(async () => { await result.current.mutateAsync({ movimentacao_id: "a", classe: "aporte", motivo: "aporte do sócio" }); });
  expect(supabase.rpc).toHaveBeenCalledWith("fn_orfao_nao_recebivel", { p_movimentacao_id: "a", p_classe: "aporte", p_motivo: "aporte do sócio" });
  expect(qc.getQueryState([QK_ORFAOS])?.isInvalidated).toBe(true);
  expect(qc.getQueryState([QK_ORFAOS_RESOLVIDOS])?.isInvalidated).toBe(true);
  unmount(); qc.clear();
});

it("desfazer atualiza ambas as filas e propaga a recusa real do banco", async () => {
  const qc = new QueryClient();
  qc.setQueryData([QK_ORFAOS], []);
  qc.setQueryData([QK_ORFAOS_RESOLVIDOS], []);
  const { result, unmount } = renderHook(() => useDesfazerNaoRecebivel(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  await act(async () => { await result.current.mutateAsync({ movimentacao_id: "a" }); });
  expect(supabase.rpc).toHaveBeenCalledWith("fn_orfao_nao_recebivel_desfazer", { p_movimentacao_id: "a" });
  expect(qc.getQueryState([QK_ORFAOS])?.isInvalidated).toBe(true);
  expect(qc.getQueryState([QK_ORFAOS_RESOLVIDOS])?.isInvalidated).toBe(true);
  (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { ok: false, erro: "Crédito já atribuído" }, error: null });
  await act(async () => { await expect(result.current.mutateAsync({ movimentacao_id: "a" })).rejects.toThrow("Crédito já atribuído"); });
  unmount(); qc.clear();
});

it("tirar da fila propaga ok false sem mascarar erro", async () => {
  const qc = new QueryClient();
  const { result, unmount } = renderHook(() => useMarcarNaoRecebivel(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>,
  });
  (supabase.rpc as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { ok: false, erro: "Classe inválida" }, error: null });
  await act(async () => { await expect(result.current.mutateAsync({ movimentacao_id: "a", classe: "x", motivo: "12345" })).rejects.toThrow("Classe inválida"); });
  unmount(); qc.clear();
});