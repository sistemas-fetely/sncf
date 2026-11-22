import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { ProcessoTarefa } from "@/hooks/processos/useProcessoTarefas";
import { controlesTarefaFila, ordenarFilaPorCaso, podeConcluirTarefaFila, useConcluirTarefaFila, type TarefaFila } from "./useFilaProcessos";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
afterEach(() => vi.clearAllMocks());

const tarefa = (id: string, esta_aberta = true) => ({ id, esta_aberta, bloqueante: false } as TarefaFila);
const processo = (dados: Partial<ProcessoTarefa>) => ({ fecha_por: "pessoa", passo_codigo: "registrar", ...dados } as ProcessoTarefa);

it("passo do sistema não permite concluir nem cancelar à mão", () => {
  const proc = processo({ fecha_por: "sistema" });
  expect(controlesTarefaFila(true, proc)).toEqual({ concluir: false, cancelar: false });
  expect(podeConcluirTarefaFila(tarefa("sistema"), proc, "Feito", "")).toBe(false);
});

it("passo de pessoa só permite conclusão com texto, nunca cancelamento", () => {
  const proc = processo({});
  expect(controlesTarefaFila(true, proc)).toEqual({ concluir: true, cancelar: false });
  for (const texto of ["", "   "]) {
    expect(podeConcluirTarefaFila(tarefa("pessoa"), proc, texto, "https://exemplo.test/prova")).toBe(false);
  }
  expect(podeConcluirTarefaFila(tarefa("pessoa"), proc, "Reembolso conferido", "")).toBe(true);
});

it("decidir_desfecho não permite conclusão ou cancelamento comuns", () => {
  for (const fecha_por of ["pessoa", "sistema"] as const) {
    expect(controlesTarefaFila(true, processo({ passo_codigo: "decidir_desfecho", fecha_por }))).toEqual({ concluir: false, cancelar: false });
  }
});

it("tarefas sem processo preservam concluir, cancelar e evidência por URL para bloqueantes", () => {
  expect(controlesTarefaFila(true)).toEqual({ concluir: true, cancelar: true });
  expect(podeConcluirTarefaFila(tarefa("normal"), undefined, "", "")).toBe(true);
  const bloqueante = { ...tarefa("bloqueante"), bloqueante: true };
  expect(podeConcluirTarefaFila(bloqueante, undefined, "", "")).toBe(false);
  expect(podeConcluirTarefaFila(bloqueante, undefined, "", "https://exemplo.test/prova")).toBe(true);
});

it("tarefas encerradas não oferecem conclusão ou cancelamento", () => {
  expect(controlesTarefaFila(false)).toEqual({ concluir: false, cancelar: false });
  expect(controlesTarefaFila(false, processo({}))).toEqual({ concluir: false, cancelar: false });
});

it("agrupa abertas pelo caso, ordena pela posição e preserva a primeira posição de cada grupo", () => {
  const linhas = [tarefa("a2"), tarefa("normal"), tarefa("b2"), tarefa("a1"), tarefa("b1"), tarefa("a-fechada", false)];
  const mapa = new Map([
    ["a2", processo({ caso_chave: "a", caso_posicao: 2 })],
    ["a1", processo({ caso_chave: "a", caso_posicao: 1 })],
    ["b2", processo({ caso_chave: "b", caso_posicao: 2 })],
    ["b1", processo({ caso_chave: "b", caso_posicao: 1 })],
    ["a-fechada", processo({ caso_chave: "a", caso_posicao: 3 })],
  ]);
  expect(ordenarFilaPorCaso(linhas, mapa).map((t) => t.id)).toEqual(["a1", "a2", "normal", "b1", "b2", "a-fechada"]);
  expect(linhas.map((t) => t.id)).toEqual(["a2", "normal", "b2", "a1", "b1", "a-fechada"]);
  expect(ordenarFilaPorCaso(linhas).map((t) => t.id)).toEqual(linhas.map((t) => t.id));
});

function montar() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => useConcluirTarefaFila(), { wrapper }) };
}

it("envia o texto e a URL de evidência pelo concluir_tarefa existente", async () => {
  rpc.mockResolvedValue({ error: null });
  const { result, unmount, client } = montar();
  await act(async () => {
    await result.current.mutateAsync({ id: "tarefa-pessoa", evidenciaTexto: "  Reembolso conferido  ", evidenciaUrl: " https://exemplo.test/prova " });
  });
  expect(rpc).toHaveBeenCalledWith("concluir_tarefa", {
    p_tarefa_id: "tarefa-pessoa", p_evidencia_texto: "Reembolso conferido", p_evidencia_url: "https://exemplo.test/prova",
  });
  unmount(); client.clear();
});

it("mostra a mensagem literal do banco quando a conclusão é recusada", async () => {
  const erro = { message: "Este passo fecha sozinho pelo sistema." };
  rpc.mockResolvedValue({ error: erro });
  const { result, unmount, client } = montar();
  await act(async () => {
    await expect(result.current.mutateAsync({ id: "tarefa-sistema" })).rejects.toEqual(erro);
  });
  expect(toast.error).toHaveBeenCalledWith(erro.message);
  unmount(); client.clear();
});