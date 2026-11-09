import { describe, expect, it } from "vitest";
import { atualizarFiltroConciliacao } from "./ConciliacaoEstoque";

describe("Conciliação: filtros e paginação na mesma atualização da URL", () => {
  it("mantém Site SP selecionado ao voltar para a primeira página", () => {
    const original = new URLSearchParams("aba=divergencias&pagina=3");
    const resultado = atualizarFiltroConciliacao(original, "centro", "SITE-SP");
    expect(resultado.get("centro")).toBe("SITE-SP");
    expect(resultado.has("pagina")).toBe(false);
    expect(original.get("pagina")).toBe("3");
  });

  it("mantém coleção e busca 01888 sem apagar o centro e a aba", () => {
    const params = new URLSearchParams("aba=divergencias&centro=SITE-SP&pagina=3");
    const colecao = atualizarFiltroConciliacao(params, "colecao", "Célébrée");
    const resultado = atualizarFiltroConciliacao(colecao, "q", "01888");
    expect(Object.fromEntries(resultado)).toEqual({ aba: "divergencias", centro: "SITE-SP", colecao: "Célébrée", q: "01888" });
  });

  it("mantém outros centros ao remover só a coleção", () => {
    const params = new URLSearchParams("centro=SITE-SP,XPM-SC&colecao=Sweet+Candy&q=01888&pagina=2");
    const resultado = atualizarFiltroConciliacao(params, "colecao", null);
    expect(resultado.get("centro")).toBe("SITE-SP,XPM-SC");
    expect(resultado.get("q")).toBe("01888");
    expect(resultado.has("colecao")).toBe(false);
    expect(resultado.has("pagina")).toBe(false);
  });
});