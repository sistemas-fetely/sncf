import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { filtroAndamento, podeRegistrarAndamento, useAndamentoCaso, useRegistrarAndamento } from "./useAndamentoCaso";
import { tarefaEstaAtrasada, type ProcessoTarefa } from "./useProcessoTarefas";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc, from: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const clientes: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clientes.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => { clientes.forEach((c) => c.clear()); clientes.length = 0; vi.clearAllMocks(); });

it("exige pelo menos 3 caracteres não vazios", () => {
  for (const texto of ["", "  ", "ab", " a "]) expect(podeRegistrarAndamento(texto, "", "2026-11-22")).toBe(false);
  expect(podeRegistrarAndamento("abc", "", "2026-11-22")).toBe(true);
});
it("data é opcional e nunca pode estar no passado", () => {
  expect(podeRegistrarAndamento("Contato", "", "2026-11-22")).toBe(true);
  expect(podeRegistrarAndamento("Contato", "2026-11-21", "2026-11-22")).toBe(false);
  expect(podeRegistrarAndamento("Contato", "2026-11-22", "2026-11-22")).toBe(true);
  expect(podeRegistrarAndamento("Contato", "2026-11-23", "2026-11-22")).toBe(true);
});
it("retomar_em ativo exclui a tarefa do atraso sem alterar as demais", () => {
  expect(tarefaEstaAtrasada(true, { retomar_em: "2026-11-25" } as ProcessoTarefa)).toBe(false);
  expect(tarefaEstaAtrasada(true, { retomar_em: null } as ProcessoTarefa)).toBe(true);
  expect(tarefaEstaAtrasada(true)).toBe(true);
  expect(tarefaEstaAtrasada(false)).toBe(false);
});
it("filtro inclui caso OU pedido OU devolução, omitindo nulos", () => {
  expect(filtroAndamento({ casoId: "caso", pedidoId: "pedido", devolucaoId: "dev" })).toBe("caso_id.eq.caso,pedido_id.eq.pedido,devolucao_id.eq.dev");
  expect(filtroAndamento({ casoId: "caso", pedidoId: null })).toBe("caso_id.eq.caso");
  expect(filtroAndamento({})).toBe("");
});
it("busca o histórico completo mais recente primeiro numa consulta por página", async () => {
  const range = vi.fn().mockResolvedValue({ data: [{ id: "andamento" }], error: null });
  const order = vi.fn().mockReturnValue({ order: vi.fn().mockReturnValue({ range }) });
  const or = vi.fn().mockReturnValue({ order });
  vi.mocked(supabase.from).mockReturnValue({ select: () => ({ or }) } as never);
  const { result, unmount } = renderHook(() => useAndamentoCaso({ casoId: "caso", pedidoId: "pedido" }), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(or).toHaveBeenCalledWith("caso_id.eq.caso,pedido_id.eq.pedido");
  expect(order).toHaveBeenCalledWith("criado_em", { ascending: false });
  expect(range).toHaveBeenCalledWith(0, 499);
  expect(result.current.data).toEqual([{ id: "andamento" }]);
  unmount();
});
it.each(["tarefa", "devolucao"])("registra por %s usando exclusivamente a RPC e atualiza as leituras", async (origem) => {
  rpc.mockResolvedValue({ data: "novo-id", error: null });
  const provider = wrapper();
  const invalidar = vi.spyOn(clientes[clientes.length - 1], "invalidateQueries");
  const { result, unmount } = renderHook(() => useRegistrarAndamento(), { wrapper: provider });
  const caso = origem === "tarefa" ? { tarefaId: "tarefa", devolucaoId: "dev" } : { devolucaoId: "dev" };
  await act(async () => { await result.current.mutateAsync({ caso, texto: " Cliente contatado ", retomarEm: "" }); });
  expect(rpc).toHaveBeenCalledWith("processo_andamento_registrar", {
    p_texto: "Cliente contatado", p_tarefa_id: origem === "tarefa" ? "tarefa" : null,
    p_devolucao_id: origem === "devolucao" ? "dev" : null, p_retomar_em: null,
  });
  for (const queryKey of [["tarefas", "fila-processos"], ["processos"], ["processos", "andamento"]]) expect(invalidar).toHaveBeenCalledWith({ queryKey });
  expect(toast.success).toHaveBeenCalledWith("Andamento registrado");
  unmount();
});
it("envia a retomada informada sem converter o dia", async () => {
  rpc.mockResolvedValue({ data: "id", error: null });
  const { result, unmount } = renderHook(() => useRegistrarAndamento(), { wrapper: wrapper() });
  await act(async () => { await result.current.mutateAsync({ caso: { tarefaId: "tarefa" }, texto: "Contato feito", retomarEm: "2099-01-02" }); });
  expect(rpc).toHaveBeenCalledWith("processo_andamento_registrar", expect.objectContaining({ p_retomar_em: "2099-01-02" }));
  unmount();
});
it("mostra erro literal do banco sem encobrir a recusa", async () => {
  const erro = { message: "Este caso não permite registrar andamento." };
  rpc.mockResolvedValue({ data: null, error: erro });
  const { result, unmount } = renderHook(() => useRegistrarAndamento(), { wrapper: wrapper() });
  await act(async () => { await expect(result.current.mutateAsync({ caso: { tarefaId: "tarefa" }, texto: "Contato", retomarEm: "" })).rejects.toEqual(erro); });
  expect(toast.error).toHaveBeenCalledWith(erro.message);
  unmount();
});