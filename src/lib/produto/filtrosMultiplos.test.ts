import { describe, expect, it } from "vitest";
import { filtrarDimensoesProduto, lerFiltroProduto, opcoesFiltroProduto } from "./filtrosMultiplos";

const linhas = [
  { sku: "1", colecao: "A", grupo: "Vela", fase: "ativo", saldo: 1 },
  { sku: "1", colecao: "A", grupo: "Vela", fase: "ativo", saldo: 1 },
  { sku: "2", colecao: "B", grupo: "Vela", fase: "pre_venda", saldo: 0 },
  { sku: "3", colecao: "C", grupo: "Prato", fase: "ativo", saldo: 1 },
  { sku: "4", colecao: null, grupo: null, fase: null, saldo: 1 },
];

describe("filtros múltiplos de produto", () => {
  it("aceita todos/todas/vazio e links antigos com um valor", () => {
    for (const valor of ["", "todos", "todas", "__todas"]) expect(lerFiltroProduto(valor)).toEqual([]);
    expect(lerFiltroProduto("ativo")).toEqual(["ativo"]);
    expect(lerFiltroProduto("ativo,pre_venda")).toEqual(["ativo", "pre_venda"]);
  });
  it("combina IN por E entre coleção, grupo e fase", () => {
    expect(filtrarDimensoesProduto(linhas, { colecao: ["A", "B"], grupo: ["Vela"], fase: ["pre_venda"] }).map(l => l.sku)).toEqual(["2"]);
  });
  it("vazio não filtra e conserva produtos sem dimensão", () => {
    expect(filtrarDimensoesProduto(linhas, { colecao: [], grupo: [], fase: [] })).toHaveLength(5);
  });
  it("seleção explícita de todas não inclui valores nulos", () => {
    expect(filtrarDimensoesProduto(linhas, { colecao: ["A", "B", "C"] })).toHaveLength(4);
  });
  for (const campo of ["colecao", "grupo", "fase"] as const) {
    it(`conta ${campo} ignorando só o próprio filtro e mantém opções zeradas`, () => {
      const selecao = { colecao: ["A", "B"], grupo: ["Vela"], fase: ["ativo"] };
      const valores = campo === "colecao" ? ["A", "B", "C"] : campo === "grupo" ? ["Vela", "Prato"] : ["ativo", "pre_venda"];
      const opcoes = opcoesFiltroProduto(linhas, selecao, campo, valores, l => l.saldo > 0, l => l.sku);
      expect(opcoes.map(o => o.contagem)).toEqual(campo === "colecao" ? [1, 0, 0] : [1, 0]);
    });
  }
});