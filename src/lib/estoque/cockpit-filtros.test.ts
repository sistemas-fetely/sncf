import { describe, expect, it } from "vitest";
import { contarOpcoesCockpit, filtrarCockpit, SEM_GRUPO, type FiltrosCockpit, type ProdutoFiltroCockpit } from "./cockpit-filtros";

const filtros: FiltrosCockpit = { busca: "", fase: [], grupos: [], colecoes: [], centro: "todos", situacao: [] };
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
    for (const patch of [{ fase: ["Outra"] }, { situacao: ["Outra"] }, { busca: "inexistente" }]) {
      expect(contarOpcoesCockpit(linhas, { ...filtros, ...patch }, "colecao").size).toBe(0);
    }
  });
  it("fase aceita múltiplos valores e combina com coleção", () => {
    const dados = [...linhas, { ...produto("5", "Vela", "A"), fase: "Nova" }, { ...produto("6", "Vela", "A"), fase: "Antiga" }];
    expect(filtrarCockpit(dados, { ...filtros, fase: ["Ativo", "Nova"], colecoes: ["A"] }).map((l) => l.sku)).toEqual(["1", "1", "3", "5"]);
  });
  it("situação aceita múltiplos valores e combina com fase e grupo", () => {
    const dados = [...linhas, { ...produto("5", "Vela", "A"), situacao: "Esgotado" }, { ...produto("6", "Vela", "A"), situacao: "Outro" }];
    expect(filtrarCockpit(dados, { ...filtros, fase: ["Ativo"], situacao: ["Disponível", "Esgotado"], grupos: ["Vela"] }).map((l) => l.sku)).toEqual(["1", "1", "4", "5"]);
  });
  it("contagem de fase ignora só fase e deduplica centros", () => {
    expect([...contarOpcoesCockpit(linhas, { ...filtros, fase: ["Outra"], grupos: ["Vela"], colecoes: ["A"], situacao: ["Disponível"] }, "fase")]).toEqual([["Ativo", 1]]);
    expect(contarOpcoesCockpit(linhas, { ...filtros, situacao: ["Outra"] }, "fase").size).toBe(0);
  });
  it("contagem de situação ignora só situação e respeita fase e centro", () => {
    expect([...contarOpcoesCockpit(linhas, { ...filtros, situacao: ["Outra"], fase: ["Ativo"], centro: "SC" }, "situacao")]).toEqual([["Disponível", 1]]);
    expect(contarOpcoesCockpit(linhas, { ...filtros, fase: ["Outra"] }, "situacao").size).toBe(0);
  });
});