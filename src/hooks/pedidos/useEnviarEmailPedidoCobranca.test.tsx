import { createElement, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { useEnviarEmailPedidoCobranca } from "./useEnviarEmailPedidoCobranca";

const m = vi.hoisted(() => ({ from: vi.fn(), invoke: vi.fn(), toast: vi.fn(), rpc: vi.fn(), invalidate: vi.fn(), exportar: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: m.from, functions: { invoke: m.invoke }, rpc: m.rpc } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: m.toast }) }));
vi.mock("@/lib/pedidoPdf", () => ({ gerarPedidoPdf: () => "pdf" }));
vi.mock("@/hooks/pedidos/usePedidoParaExportar", () => ({ fetchPedidoParaExportar: m.exportar }));
vi.mock("@/lib/pedidos/invalidarPedido", () => ({ invalidarPedido: m.invalidate }));
beforeEach(() => {
  vi.clearAllMocks();
  m.exportar.mockResolvedValue({ pedido: { id_externo: "PED-TESTE", forma_solicitada: "pix" }, parceiro: {}, pdf: {} });
  m.invoke.mockResolvedValue({ data: {}, error: null }); m.rpc.mockResolvedValue({ error: null });
});
function setup(link: unknown, error: unknown = null) {
  m.from.mockImplementation((table: string) => {
    const q = { select: () => q, eq: () => q, update: () => q, not: () => q,
      maybeSingle: async () => ({ data: link, error }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    if (table !== "vw_pedido_link_pagamento" && table !== "titulo_a_receber") throw new Error("fallback indevido");
    return q;
  });
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return renderHook(() => useEnviarEmailPedidoCobranca(), { wrapper });
}
it("envia cobrança com URL PIX da trilha sem exigir link manual", async () => {
  const { result, unmount } = setup({ link: "https://pagamento.example/pix", tipo_pagamento: "pix", situacao: "valido" });
  await act(async () => { await result.current.mutateAsync({ pedido_id: "pedido", emails: ["teste@example.test"] }); });
  expect(m.invoke).toHaveBeenCalledWith("send-transactional-email", expect.objectContaining({ body: expect.objectContaining({
    templateData: expect.objectContaining({ tipo_pagamento: "pix", link_pagamento: "https://pagamento.example/pix" }) }) }));
  expect(m.from.mock.calls.filter(([table]) => table === "provisao_recebimento")).toHaveLength(0);
  unmount();
});
it("erro da trilha bloqueia envio com mensagem original", async () => {
  const { result, unmount } = setup(null, { message: "Erro literal da trilha" });
  await act(async () => { await expect(result.current.mutateAsync({ pedido_id: "pedido", emails: ["teste@example.test"] })).rejects.toThrow("Erro literal da trilha"); });
  expect(m.invoke).not.toHaveBeenCalled(); unmount();
});