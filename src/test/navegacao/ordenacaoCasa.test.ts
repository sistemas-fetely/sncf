import { describe, it, expect } from "vitest";
import { ordenacaoParaTexto, textoParaOrdenacao, ORDENACAO_PADRAO } from "@/lib/pedidos/ordenacaoCasa";

describe("ordenação da Casa dos Pedidos na URL", () => {
  it("preset ida e volta", () => {
    expect(ordenacaoParaTexto({ tipo: "preset", preset: "entrada_paga" })).toBe("preset:entrada_paga");
    expect(textoParaOrdenacao("preset:cronologico")).toEqual({ tipo: "preset", preset: "cronologico" });
  });
  it("preset padrão fica fora da URL", () => {
    expect(ordenacaoParaTexto(ORDENACAO_PADRAO)).toBe("");
    expect(textoParaOrdenacao("")).toEqual(ORDENACAO_PADRAO);
  });
  it("coluna ida e volta", () => {
    expect(ordenacaoParaTexto({ tipo: "coluna", coluna: "valor", dir: "desc" })).toBe("coluna:valor:desc");
    expect(textoParaOrdenacao("coluna:na_fase:asc")).toEqual({ tipo: "coluna", coluna: "na_fase", dir: "asc" });
  });
  it("inválido → padrão", () => {
    for (const t of ["preset:xyz", "coluna:valor", "coluna:foo:asc", "coluna:valor:up", "lixo"])
      expect(textoParaOrdenacao(t)).toEqual(ORDENACAO_PADRAO);
  });
});
