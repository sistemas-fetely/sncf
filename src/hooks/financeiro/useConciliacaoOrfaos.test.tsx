import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QK_ORFAOS, useAtribuirOrfao } from "./useConciliacaoOrfaos";

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