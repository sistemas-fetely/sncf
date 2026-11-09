import { describe, expect, it } from "vitest";
import { ABAS, destinoProduto } from "./ProdutoAbas";

describe("navegação da Central do Produto", () => {
  it("mantém a ordem e as rotas das cinco telas", () => {
    expect(ABAS.map(aba => aba.to)).toEqual([
      "/vendas/produto/mesa", "/vendas/produto/conciliacao", "/vendas/produto/estoque/destinos",
      "/vendas/produto/fotos", "/vendas/produto/precos",
    ]);
  });

  for (const origem of ABAS) for (const destino of ABAS) {
    it(`leva apenas o termo de ${origem.rotulo} para ${destino.rotulo}`, () => {
      const search = new URLSearchParams({ [origem.busca]: "CÉL/01 & 02", aba: "shopify", pagina: "3", colecao: "Lavoire" });
      const url = new URL(destinoProduto(destino.to, origem.to, `?${search}`), "https://example.test");
      expect([...url.searchParams.entries()]).toEqual([[destino.busca, "CÉL/01 & 02"]]);
    });
  }

  it("Destinos recebe e repassa o termo sem perder a busca", () => {
    const entrada = destinoProduto(ABAS[2].to, ABAS[0].to, "?busca=01888&pagina=3");
    expect(destinoProduto(ABAS[3].to, ABAS[2].to, new URL(entrada, "https://example.test").search)).toBe(`${ABAS[3].to}?busca=01888`);
  });

  it("não leva filtros nem acrescenta busca vazia", () => {
    expect(destinoProduto(ABAS[1].to, ABAS[0].to, "?busca=&pagina=3")).toBe(ABAS[1].to);
  });
});