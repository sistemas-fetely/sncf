import { describe, expect, it } from "vitest";
import { contarOpcoesCockpit, filtrarCockpit, SEM_GRUPO, type FiltrosCockpit, type ProdutoFiltroCockpit } from "./cockpit-filtros";

const filtros: FiltrosCockpit = { busca: "", fase: "todos", grupos: [], colecoes: [], centro: "todos", situacao: "todos" };
const produto = (sku: string, grupo: string | null, colecao: string, centro = "SP"): ProdutoFiltroCockpit => ({
  sku, grupo, colecao, centro, cod_cadastro: sku, nome_comercial: sku, cor_nome: null, fase: "Ativo", situacao: "Disponível",
});
const linhas = [produto("1", "Vela", "A"), produto("1", "Vela", "A", "SC"), produto("2", "Prato", "B"), produto("3", null, "A"), produto("4", "Vela", "B")];

describe("filtros múltiplos do Cockpit", () => {
  it("sem seleção não restringe produtos", () => {
    expect(filtrarCockpit(linhas, filtros)).toHaveLength(5);
  });
  it("combina opções por IN e grupo com coleção por E", () => {
    expect(filtrarCockpit(linhas, { ...filtros, grupos: ["Vela", "Prato"], colecoes: ["B"] }).map((l) => l.sku)).toEqual(["2", "4"]);
  });
  it("sem grupo seleciona somente grupo nulo", () => {
    expect(filtrarCockpit(linhas, { ...filtros, grupos: [SEM_GRUPO] }).map((l) => l.sku)).toEqual(["3"]);
  });
  it("conta produtos únicos ignorando apenas a própria seleção", () => {
    expect([...contarOpcoesCockpit(linhas, { ...filtros, grupos: ["Prato"], colecoes: ["A"] }, "grupo")]).toEqual([["Vela", 1], [SEM_GRUPO, 1]]);
    expect([...contarOpcoesCockpit(linhas, { ...filtros, grupos: ["Vela"], colecoes: ["A"] }, "colecao")]).toEqual([["A", 1], ["B", 1]]);
  });
  it("contagens respeitam centro, fase, situação e busca", () => {
    expect([...contarOpcoesCockpit(linhas, { ...filtros, centro: "SC" }, "grupo")]).toEqual([["Vela", 1]]);
    for (const patch of [{ fase: "Outra" }, { situacao: "Outra" }, { busca: "inexistente" }]) {
      expect(contarOpcoesCockpit(linhas, { ...filtros, ...patch }, "colecao").size).toBe(0);
    }
  });
});