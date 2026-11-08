import { describe, expect, it } from "vitest";
import { destinoEstoque } from "./EstoqueAbas";

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