import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { passoDoMotor, useProcessoPassosVivos, type ProcessoPassoVivo } from "./useProcessoPassosVivos";
import { idsHistoricoSobDemanda, useProcessoRegrasHistorico, type ProcessoRegra } from "./useProcessoRegras";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
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