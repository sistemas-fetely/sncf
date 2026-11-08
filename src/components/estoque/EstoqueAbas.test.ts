import { describe, expect, it } from "vitest";
import { ABAS, destinoEstoque } from "./EstoqueAbas";

describe("navegação entre telas de estoque", () => {
  const destino = "/vendas/produto/estoque/virtual";

  it("preserva q e não leva filtros específicos da tela de origem", () => {
    expect(destinoEstoque(destino, "?q=vela&aba=xpm&pagina=3&centro_card=XPM-SC"))
      .toBe(`${destino}?q=vela`);
  });

  it("preserva códigos com espaços, barras e caracteres especiais", () => {
    const url = destinoEstoque(destino, "?q=C%C3%89L%2F01+%26+02");
    expect(new URL(url, "https://example.test").searchParams.get("q")).toBe("CÉL/01 & 02");
  });

  it("não acrescenta query quando não há busca", () => {
    expect(destinoEstoque(destino, "?aba=xpm")).toBe(destino);
  });
});

describe("barra de abas do estoque", () => {
  it("tem as quatro abas na ordem Central, Cockpit, Conciliação, Inventário", () => {
    expect(ABAS.map(aba => aba.rotulo)).toEqual(["Central", "Cockpit", "Conciliação", "Inventário"]);
    expect(ABAS.map(aba => aba.to)).toEqual([
      "/vendas/produto/estoque/central",
      "/vendas/produto/estoque/virtual",
      "/vendas/produto/estoque/conciliacao",
      "/vendas/produto/estoque/inventario",
    ]);
  });

  it("leva a busca para a aba do Inventário", () => {
    expect(destinoEstoque("/vendas/produto/estoque/inventario", "?q=vela&card=acabando"))
      .toBe("/vendas/produto/estoque/inventario?q=vela");
  });
});
