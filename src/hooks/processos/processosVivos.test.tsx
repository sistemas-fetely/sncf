import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { passoDoMotor, useProcessoPassosVivos, type ProcessoPassoVivo } from "./useProcessoPassosVivos";
import { idsHistoricoSobDemanda, useProcessoRegrasHistorico, podeSalvarRegra, useAlterarProcessoRegra, type EdicaoRegra, type ProcessoRegra } from "./useProcessoRegras";
import { linkDoCaso, useProcessoRastreioPorPedido, type ProcessoTarefa } from "./useProcessoTarefas";
import { toast } from "sonner";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn(), rpc: rpcMock } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const clientes: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clientes.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
afterEach(() => { clientes.forEach((c) => c.clear()); clientes.length = 0; vi.clearAllMocks(); });

it("somente código não nulo identifica passo do motor protegido contra remoção", () => {
  expect(passoDoMotor(undefined)).toBe(false);
  expect(passoDoMotor({ codigo: null } as ProcessoPassoVivo)).toBe(false);
  expect(passoDoMotor({ codigo: "triar_motivo" } as ProcessoPassoVivo)).toBe(true);
});

it("consulta uma vez os passos do processo e indexa por passo_id", async () => {
  const linha = { passo_id: "passo-triagem", codigo: "triar_motivo", tarefas_abertas: 1 };
  const eq = vi.fn().mockResolvedValue({ data: [linha], error: null });
  const select = vi.fn().mockReturnValue({ eq });
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  const { result, unmount } = renderHook(() => useProcessoPassosVivos("processo-devolucao"), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalledWith("vw_processo_passo_vivo");
  expect(eq).toHaveBeenCalledWith("processo_id", "processo-devolucao");
  expect(result.current.data?.get("passo-triagem")).toEqual(linha);
  unmount();
});

it("histórico só inclui regras expandidas que têm mudanças", () => {
  const regras = [{ id: "alterada", mudancas: 2 }, { id: "original", mudancas: 0 }, { id: "fechada", mudancas: 1 }] as ProcessoRegra[];
  expect(idsHistoricoSobDemanda(regras, new Set(["alterada", "original"]))).toEqual(["alterada"]);
  expect(idsHistoricoSobDemanda(regras, new Set())).toEqual([]);
});

it("não busca histórico enquanto não houver regra expandida com mudanças", () => {
  const { unmount } = renderHook(() => useProcessoRegrasHistorico("processo-devolucao", []), { wrapper: wrapper() });
  expect(supabase.from).not.toHaveBeenCalled();
  unmount();
});

it("busca os históricos expandidos juntos, mais recentes primeiro", async () => {
  const anterior = { regra_id: "triagem", valor: 2, substituido_em: "2026-11-22T12:00:00Z" };
  const order = vi.fn().mockResolvedValue({ data: [anterior, { regra_id: "reembolso", valor: 3 }], error: null });
  const inIds = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ in: inIds });
  vi.mocked(supabase.from).mockReturnValue({ select } as never);
  const { result, unmount } = renderHook(() => useProcessoRegrasHistorico("processo-devolucao", ["triagem", "reembolso"]), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalledWith("processo_regra_historico");
  expect(inIds).toHaveBeenCalledWith("regra_id", ["triagem", "reembolso"]);
  expect(order).toHaveBeenCalledWith("substituido_em", { ascending: false, nullsFirst: false });
  expect(result.current.data?.get("triagem")).toEqual([anterior]);
  unmount();
});

it("propaga a falha de leitura em vez de devolver histórico vazio", async () => {
  const error = { message: "Leitura do histórico recusada" };
  const order = vi.fn().mockResolvedValue({ data: null, error });
  vi.mocked(supabase.from).mockReturnValue({ select: () => ({ in: () => ({ order }) }) } as never);
  const { result, unmount } = renderHook(() => useProcessoRegrasHistorico("processo-devolucao", ["triagem"]), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error).toEqual(error);
  unmount();
});

const regra = { id: "prazo", unidade: "dias_uteis", valor: 2, valor_texto: null, conta_a_partir_de: "Entrega" } as ProcessoRegra;
const edicao: EdicaoRegra = { valor: "3", valorTexto: "", contaAPartirDe: "Entrega", motivo: "Prazo revisto" };

it("exige motivo não vazio para alterar a regra", () => {
  expect(podeSalvarRegra(regra, { ...edicao, motivo: "" })).toBe(false);
  expect(podeSalvarRegra(regra, { ...edicao, motivo: "  " })).toBe(false);
  expect(podeSalvarRegra(regra, edicao)).toBe(true);
});

it("não permite salvar quando só o motivo mudou", () => {
  expect(podeSalvarRegra(regra, { ...edicao, valor: "2" })).toBe(false);
  expect(podeSalvarRegra(regra, { ...edicao, valor: "2", valorTexto: "Observação nova" })).toBe(true);
  expect(podeSalvarRegra(regra, { ...edicao, valor: "2", contaAPartirDe: "NF" })).toBe(true);
});

it("novo valor numérico deve ser inteiro maior ou igual a zero", () => {
  for (const valor of ["-1", "1.5", "", "abc"]) expect(podeSalvarRegra(regra, { ...edicao, valor })).toBe(false);
  expect(podeSalvarRegra(regra, { ...edicao, valor: "0" })).toBe(true);
});

it("regra de texto dispensa o número e exige mudança no texto ou na contagem", () => {
  const texto = { ...regra, unidade: "texto", valor: null, valor_texto: "Texto atual" };
  expect(podeSalvarRegra(texto, { ...edicao, valor: "", valorTexto: "Texto novo" })).toBe(true);
  expect(podeSalvarRegra(texto, { ...edicao, valor: "3", valorTexto: "Texto atual" })).toBe(false);
});

it("salva pela RPC e atualiza regras, histórico e passos do processo", async () => {
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
  const provider = wrapper();
  const qc = clientes[clientes.length - 1];
  const invalidar = vi.spyOn(qc, "invalidateQueries");
  const { result, unmount } = renderHook(() => useAlterarProcessoRegra("processo-devolucao"), { wrapper: provider });
  await act(async () => { await result.current.mutateAsync({ regra, edicao }); });
  expect(supabase.rpc).toHaveBeenCalledWith("processo_regra_alterar", {
    p_regra_id: "prazo", p_valor: 3, p_valor_texto: null, p_conta_a_partir_de: "Entrega", p_motivo: "Prazo revisto",
  });
  for (const chave of ["regras", "regras-historico", "passos-vivos"]) {
    expect(invalidar).toHaveBeenCalledWith({ queryKey: ["processos", chave, "processo-devolucao"] });
  }
  expect(toast.success).toHaveBeenCalledWith("Regra atualizada");
  unmount();
});

it.each([null, 7])("preserva p_valor=%s ao alterar regra textual", async (valor) => {
  rpcMock.mockResolvedValue({ data: {}, error: null });
  const { result, unmount } = renderHook(() => useAlterarProcessoRegra("processo"), { wrapper: wrapper() });
  await act(async () => { await result.current.mutateAsync({ regra: { ...regra, unidade: "texto", valor }, edicao: { ...edicao, valorTexto: "Regra revista" } }); });
  expect(supabase.rpc).toHaveBeenCalledWith("processo_regra_alterar", expect.objectContaining({ p_valor: valor, p_valor_texto: "Regra revista" }));
  unmount();
});

it("mantém a mensagem literal do banco no erro e não invalida leituras", async () => {
  const error = { message: "Você não tem permissão para alterar esta regra." };
  rpcMock.mockResolvedValue({ data: null, error });
  const provider = wrapper();
  const invalidar = vi.spyOn(clientes[clientes.length - 1], "invalidateQueries");
  const { result, unmount } = renderHook(() => useAlterarProcessoRegra("processo"), { wrapper: provider });
  await act(async () => { await expect(result.current.mutateAsync({ regra, edicao })).rejects.toEqual(error); });
  expect(toast.error).toHaveBeenCalledWith(error.message);
  expect(invalidar).not.toHaveBeenCalled();
  unmount();
});

it("agrupa rastreio e rastreio_nf abertos pelo pedido da view sem consultar pedido_rastreamento", async () => {
  const linhas = [
    { tarefa_id: "postal", caso_tipo: "rastreio", aberta: true, pedido_id: "pedido-1", caso_id: null },
    { tarefa_id: "nf", caso_tipo: "rastreio_nf", aberta: true, pedido_id: "pedido-1", caso_ref: "NF 874" },
    { tarefa_id: "fechada", caso_tipo: "rastreio_nf", aberta: false, pedido_id: "pedido-1" },
    { tarefa_id: "sem-pedido", caso_tipo: "rastreio", aberta: true, pedido_id: null },
    { tarefa_id: "devolucao", caso_tipo: "devolucao", aberta: true, pedido_id: "pedido-1" },
  ];
  vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockResolvedValue({ data: linhas, error: null }) } as never);
  const { result, unmount } = renderHook(() => useProcessoRastreioPorPedido(), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.get("pedido-1")).toEqual(linhas.slice(0, 2)));
  expect(result.current.size).toBe(1);
  expect(supabase.from).toHaveBeenCalledTimes(1);
  expect(supabase.from).toHaveBeenCalledWith("vw_processo_tarefa");
  unmount();
});

it("abre rastreio por nota em Entregas com a referência na busca", () => {
  expect(linkDoCaso({ caso_tipo: "rastreio_nf", caso_ref: "NF 874" } as ProcessoTarefa)).toBe("/logistica?aba=entregas&and_busca=NF%20874");
  expect(linkDoCaso({ caso_tipo: "rastreio", caso_ref: "AP123BR" } as ProcessoTarefa)).toBe("/logistica?aba=entregas&and_busca=AP123BR");
  expect(linkDoCaso({ caso_tipo: "rastreio_nf", caso_ref: null } as ProcessoTarefa)).toBeNull();
});