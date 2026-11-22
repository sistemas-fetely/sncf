import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  podeConfirmarDecisao, tarefaPermiteDecisao, useProcessoDecidir, useProcessoDecisaoPrevia,
  type DesfechoProcesso, type ProcessoDecisaoPrevia,
} from "./useProcessoDecisao";
import type { ProcessoTarefa } from "./useProcessoTarefas";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const clientes: QueryClient[] = [];
function preparar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clientes.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
afterEach(() => { clientes.forEach((c) => c.clear()); clientes.length = 0; vi.clearAllMocks(); });

const previa: ProcessoDecisaoPrevia = {
  ok: true, aberta: true, caso: "NF 874", pedido: "PED-2343", momento: "Em trânsito", pode_cancelar: true,
  pendencias: [], o_que_acontece: "Abre a devolução total.",
  financeiro: { titulos_abertos: 2, valor_aberto: 1234.56, boletos_a_baixar: 2, titulos_pagos: 1, valor_pago: 100, titulos_elegiveis: 3 },
};
const proc = { aberta: true, passo_codigo: "decidir_desfecho", caso_tipo: "rastreio" } as ProcessoTarefa;

it.each(["rastreio", "rastreio_nf"])("Decidir só aparece na tarefa aberta decidir_desfecho de %s", (caso_tipo) => {
  expect(tarefaPermiteDecisao(true, { ...proc, caso_tipo })).toBe(true);
  expect(tarefaPermiteDecisao(false, { ...proc, caso_tipo })).toBe(false);
  expect(tarefaPermiteDecisao(true, { ...proc, caso_tipo, aberta: false })).toBe(false);
  expect(tarefaPermiteDecisao(true, { ...proc, caso_tipo, passo_codigo: "triar_motivo" })).toBe(false);
});

it("não oferece decisão para devolução nem para tarefa fora do mapa", () => {
  expect(tarefaPermiteDecisao(true, { ...proc, caso_tipo: "devolucao" })).toBe(false);
  expect(tarefaPermiteDecisao(true, undefined)).toBe(false);
});

it("Confirmar exige uma prévia válida e tarefa ainda aberta", () => {
  expect(podeConfirmarDecisao(undefined, "reenviar", "Cliente pediu", "")).toBe(false);
  expect(podeConfirmarDecisao({ ...previa, ok: false }, "reenviar", "Cliente pediu", "")).toBe(false);
  expect(podeConfirmarDecisao({ ...previa, aberta: false }, "reenviar", "Cliente pediu", "")).toBe(false);
});

it("Confirmar exige escolha", () => {
  expect(podeConfirmarDecisao(previa, "", "Cliente pediu", "haver")).toBe(false);
});

it("motivo precisa de pelo menos cinco caracteres sem espaços nas pontas", () => {
  expect(podeConfirmarDecisao(previa, "reenviar", "  abcd  ", "")).toBe(false);
  expect(podeConfirmarDecisao(previa, "reenviar", "     ", "")).toBe(false);
  expect(podeConfirmarDecisao(previa, "reenviar", "abcde", "")).toBe(true);
});

it("cancelar exige desfecho, reenviar não exige", () => {
  expect(podeConfirmarDecisao(previa, "cancelar", "Cliente pediu", "")).toBe(false);
  expect(podeConfirmarDecisao(previa, "reenviar", "Cliente pediu", "")).toBe(true);
});

it.each<DesfechoProcesso>(["haver", "troca", "reembolso"])("cancelamento aceita o desfecho %s", (desfecho) => {
  expect(podeConfirmarDecisao(previa, "cancelar", "Cliente pediu", desfecho)).toBe(true);
});

it("pode_cancelar=false bloqueia apenas o cancelamento", () => {
  const bloqueada = { ...previa, pode_cancelar: false };
  expect(podeConfirmarDecisao(bloqueada, "cancelar", "Cliente pediu", "troca")).toBe(false);
  expect(podeConfirmarDecisao(bloqueada, "reenviar", "Cliente pediu", "")).toBe(true);
});

it("Confirmar fica bloqueado durante o envio", () => {
  expect(podeConfirmarDecisao(previa, "reenviar", "Cliente pediu", "", true)).toBe(false);
  expect(podeConfirmarDecisao(previa, "cancelar", "Cliente pediu", "haver", true)).toBe(false);
});

it("prévia só consulta a RPC com a janela aberta", async () => {
  rpcMock.mockResolvedValue({ data: previa, error: null });
  const { result, rerender, unmount } = renderHook(({ aberto }) => useProcessoDecisaoPrevia("tarefa-1", aberto), {
    wrapper: preparar().wrapper, initialProps: { aberto: false },
  });
  expect(rpcMock).not.toHaveBeenCalled();
  rerender({ aberto: true });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(rpcMock).toHaveBeenCalledWith("processo_devolucao_decisao_previa", { p_tarefa_id: "tarefa-1" });
  expect(result.current.data).toEqual(previa);
  unmount();
});

it("reabrir a janela busca uma prévia nova", async () => {
  rpcMock.mockResolvedValue({ data: previa, error: null });
  const { wrapper } = preparar();
  const primeira = renderHook(() => useProcessoDecisaoPrevia("tarefa-1", true), { wrapper });
  await waitFor(() => expect(primeira.result.current.isSuccess).toBe(true));
  primeira.unmount();
  const segunda = renderHook(() => useProcessoDecisaoPrevia("tarefa-1", true), { wrapper });
  await waitFor(() => expect(segunda.result.current.isSuccess).toBe(true));
  expect(rpcMock).toHaveBeenCalledTimes(2);
  segunda.unmount();
});

it("prévia recusada mantém a mensagem literal", async () => {
  rpcMock.mockResolvedValue({ data: { ok: false, erro: "A tarefa já foi encerrada." }, error: null });
  const { result, unmount } = renderHook(() => useProcessoDecisaoPrevia("tarefa-1", true), { wrapper: preparar().wrapper });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error?.message).toBe("A tarefa já foi encerrada.");
  unmount();
});

it("reenviar chama a RPC sem desfecho e invalida a fila e o mapa de processos", async () => {
  rpcMock.mockResolvedValue({ data: { ok: true, decisao: "reenviar" }, error: null });
  const { client, wrapper } = preparar();
  const invalidar = vi.spyOn(client, "invalidateQueries");
  const { result, unmount } = renderHook(() => useProcessoDecidir(), { wrapper });
  await act(async () => { await result.current.mutateAsync({ tarefaId: "tarefa-1", decisao: "reenviar", motivo: " Cliente pediu reenvio ", desfecho: "haver" }); });
  expect(rpcMock).toHaveBeenCalledWith("processo_devolucao_decidir", {
    p_tarefa_id: "tarefa-1", p_decisao: "reenviar", p_motivo: "Cliente pediu reenvio", p_desfecho: null,
  });
  expect(invalidar).toHaveBeenCalledWith({ queryKey: ["tarefas", "fila-processos"] });
  expect(invalidar).toHaveBeenCalledWith({ queryKey: ["processos", "vw_processo_tarefa"] });
  expect(toast.success).toHaveBeenCalledWith("Decisão registrada: reenviar");
  unmount();
});

it.each<DesfechoProcesso>(["haver", "troca", "reembolso"])("cancelar envia o desfecho %s e retorna a devolução aberta", async (desfecho) => {
  rpcMock.mockResolvedValue({ data: { ok: true, decisao: "cancelar", devolucao: "DEV-123" }, error: null });
  const { result, unmount } = renderHook(() => useProcessoDecidir(), { wrapper: preparar().wrapper });
  await act(async () => { await result.current.mutateAsync({ tarefaId: "tarefa-1", decisao: "cancelar", motivo: "Cliente pediu cancelamento", desfecho }); });
  expect(rpcMock).toHaveBeenCalledWith("processo_devolucao_decidir", {
    p_tarefa_id: "tarefa-1", p_decisao: "cancelar", p_motivo: "Cliente pediu cancelamento", p_desfecho: desfecho,
  });
  expect(toast.success).toHaveBeenCalledWith("Pedido cancelado · devolução DEV-123 aberta");
  unmount();
});

it("não envia RPC com motivo menor que cinco caracteres", async () => {
  const { result, unmount } = renderHook(() => useProcessoDecidir(), { wrapper: preparar().wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ tarefaId: "tarefa-1", decisao: "reenviar", motivo: "abcd", desfecho: null })).rejects.toThrow(); });
  expect(rpcMock).not.toHaveBeenCalled();
  unmount();
});

it.each([
  { data: null, error: { message: "Você não pode decidir esta tarefa." } },
  { data: { ok: false, erro: "Você não pode decidir esta tarefa." }, error: null },
])("decisão recusada mostra a mensagem literal e não invalida nem anuncia sucesso", async (resposta) => {
  rpcMock.mockResolvedValue(resposta);
  const { client, wrapper } = preparar();
  const invalidar = vi.spyOn(client, "invalidateQueries");
  const { result, unmount } = renderHook(() => useProcessoDecidir(), { wrapper });
  await act(async () => { await expect(result.current.mutateAsync({ tarefaId: "tarefa-1", decisao: "reenviar", motivo: "Cliente pediu", desfecho: null })).rejects.toBeDefined(); });
  expect(toast.error).toHaveBeenCalledWith("Você não pode decidir esta tarefa.");
  expect(toast.success).not.toHaveBeenCalled();
  expect(invalidar).not.toHaveBeenCalled();
  unmount();
});