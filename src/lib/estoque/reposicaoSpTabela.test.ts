import { describe, expect, it } from "vitest";
import { agruparReposicao, checkboxReposicao, filtrarReposicao, itensSelecionadosReposicao, marcarReposicao, ordenarReposicao, type FiltrosReposicao, type LinhaReposicaoTabela } from "./reposicaoSpTabela";
const linhas = [
  { sku: "A", cod_cadastro: "01355", nome_comercial: "Garfo Célébrée", colecao: "Festa", familia: "Mesa", grupo: "Talheres", classe: "a", situacao: "dispara", qtd_sugerida: 3, disp_sp: 10, minimo: 2, teto: 8 },
  { sku: "B", cod_cadastro: "00200", nome_comercial: "Colher", colecao: "Festa", familia: "Mesa", grupo: "Talheres", classe: "b", situacao: "carona", qtd_sugerida: 2, disp_sp: 2, minimo: 2, teto: 4 },
  { sku: "C", cod_cadastro: "00010", nome_comercial: "Vela", colecao: null, familia: "Luz", grupo: "Velas", classe: "a", situacao: "dispara", qtd_sugerida: 4, disp_sp: null, minimo: 1, teto: 2 },
] as LinhaReposicaoTabela[];
const filtros: FiltrosReposicao = { busca: "", colecoes: [], familias: [], grupos: [], classes: [], situacoes: [] };
const skus = (l: LinhaReposicaoTabela[]) => l.map(v => v.sku);
describe("Tabela Repor SP", () => {
  it("busca código e nome sem acento", () => { expect(skus(filtrarReposicao(linhas, { ...filtros, busca: "01355" }))).toEqual(["A"]); expect(skus(filtrarReposicao(linhas, { ...filtros, busca: "celebree" }))).toEqual(["A"]); });
  it("combina coleção família grupo classe e situação", () => expect(skus(filtrarReposicao(linhas, { ...filtros, colecoes: ["Festa"], familias: ["Mesa"], grupos: ["Talheres"], classes: ["a"], situacoes: ["dispara"] }))).toEqual(["A"]));
  it("multi-select aceita mais de uma opção", () => expect(skus(filtrarReposicao(linhas, { ...filtros, classes: ["a", "b"] }))).toEqual(["A", "B", "C"]));
  it.each(["colecoes", "familias", "grupos", "classes", "situacoes"] as const)("%s exclui opções não correspondentes", campo => expect(filtrarReposicao(linhas, { ...filtros, [campo]: ["inexistente"] })).toEqual([]));
  it("filtra sem coleção", () => expect(skus(filtrarReposicao(linhas, { ...filtros, colecoes: ["__sem__"] }))).toEqual(["C"]));
  it("ordem padrão não muda", () => expect(ordenarReposicao(linhas, null, {})).toEqual(linhas));
  it("ordena código numericamente", () => expect(skus(ordenarReposicao(linhas, { key: "cod_cadastro", dir: "asc" }, {}))).toEqual(["C", "B", "A"]));
  it("ordena estoque numericamente com nulos no fim", () => { expect(skus(ordenarReposicao(linhas, { key: "disp_sp", dir: "asc" }, {}))).toEqual(["B", "A", "C"]); expect(skus(ordenarReposicao(linhas, { key: "disp_sp", dir: "desc" }, {}))).toEqual(["A", "B", "C"]); });
  it("ordena min/teto usando teto no empate", () => expect(skus(ordenarReposicao(linhas, { key: "minimo", dir: "asc" }, {}))).toEqual(["C", "B", "A"]));
  it("ordena quantidade editada", () => expect(skus(ordenarReposicao(linhas, { key: "quantidade", dir: "desc" }, { A: { marcado: true, qtd: 9 } }))).toEqual(["A", "C", "B"]));
  it("agrupa por coleção com totais sugeridos e sem coleção", () => expect(agruparReposicao(linhas).map(g => [g.nome, g.produtos.length, g.unidades])).toEqual([["Festa", 2, 5], ["Sem coleção", 1, 4]]));
  it("desmarcar filtro não perde seleção nem quantidade fora dele", () => { const s = marcarReposicao({ C: { marcado: true, qtd: 7 } }, linhas.slice(0, 2), false); expect(itensSelecionadosReposicao(linhas, s)).toEqual([{ sku: "C", nome: "Vela", quantidade: 7 }]); });
  it("marcar grupo não afeta outro grupo", () => { const s = marcarReposicao(marcarReposicao({}, linhas, false), agruparReposicao(linhas)[0].produtos, true); expect(itensSelecionadosReposicao(linhas, s).map(i => i.sku)).toEqual(["A", "B"]); });
  it("checkbox representa nenhum alguns todos e vazio", () => { expect(checkboxReposicao([], {})).toBe(false); expect(checkboxReposicao(linhas, {})).toBe(true); expect(checkboxReposicao(linhas, marcarReposicao({}, [linhas[0]], false))).toBe("indeterminate"); expect(checkboxReposicao(linhas, marcarReposicao({}, linhas, false))).toBe(false); });
  it("transferência inclui selecionados fora do filtro", () => { const visiveis = filtrarReposicao(linhas, { ...filtros, busca: "01355" }); const itens = itensSelecionadosReposicao(linhas, {}); expect(visiveis).toHaveLength(1); expect(itens.map(i => i.sku)).toEqual(["A", "B", "C"]); expect(itens.reduce((s, i) => s + i.quantidade, 0)).toBe(9); });
});
