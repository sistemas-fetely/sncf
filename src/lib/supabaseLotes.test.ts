import { describe, expect, it, vi } from "vitest";
import { buscarTodos } from "./supabaseLotes";

function consulta<T>(linhas: T[]) {
  const order = vi.fn();
  const range = vi.fn(async (de: number, ate: number) => ({ data: linhas.slice(de, ate + 1), error: null }));
  const factory = vi.fn(() => {
    const query = { order: (coluna: string) => { order(coluna); return query; }, range };
    return query;
  });
  return { factory, order, range };
}

describe("buscarTodos", () => {
  it("carrega os 1205 produtos, inclusive os 18 da coleção e o código 02041 após a linha 1000", async () => {
    const linhas = Array.from({ length: 1205 }, (_, i) => ({
      cod_cadastro: i >= 1024 && i <= 1041 ? String(2024 + i - 1024).padStart(5, "0") : `produto-${i}`,
      colecao: i >= 1024 && i <= 1041 ? "Esprit d’Halloween" : "Outra",
    }));
    const q = consulta(linhas);
    const todos = await buscarTodos(q.factory, ["cod_cadastro", "sku"]);
    expect(todos).toEqual(linhas);
    expect(todos).toHaveLength(1205);
    expect(todos.filter(l => l.colecao === "Esprit d’Halloween")).toHaveLength(18);
    expect(todos.find(l => l.cod_cadastro === "02041")).toEqual(linhas[1041]);
    expect(q.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(q.order.mock.calls).toEqual([["cod_cadastro"], ["sku"], ["cod_cadastro"], ["sku"]]);
    expect(q.factory).toHaveBeenCalledTimes(2);
  });

  it("busca lote vazio final quando o total é múltiplo exato", async () => {
    const q = consulta(Array.from({ length: 2000 }, (_, i) => i));
    expect(await buscarTodos(q.factory, ["id"])).toHaveLength(2000);
    expect(q.range.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("preserva o erro de um lote posterior, sem devolver resultado parcial", async () => {
    const erro = { message: "Leitura recusada" };
    const q = consulta(Array.from({ length: 1000 }, (_, i) => i));
    q.range.mockImplementationOnce(async () => ({ data: Array.from({ length: 1000 }, (_, i) => i), error: null }));
    q.range.mockImplementationOnce(async () => { throw erro; });
    await expect(buscarTodos(q.factory, ["id"])).rejects.toBe(erro);
  });

  it("recusa lote acima do limite da API", async () => {
    const q = consulta([]);
    await expect(buscarTodos(q.factory, ["id"], 1001)).rejects.toThrow("entre 1 e 1000");
    expect(q.factory).not.toHaveBeenCalled();
  });

  it("aceita lote menor e encerra coleção vazia", async () => {
    const q = consulta([1, 2, 3]);
    expect(await buscarTodos(q.factory, ["id"], 2)).toEqual([1, 2, 3]);
    expect(q.range.mock.calls).toEqual([[0, 1], [2, 3]]);
    expect(await buscarTodos(consulta([]).factory, ["id"])).toEqual([]);
  });
});