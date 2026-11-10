import { describe, expect, it } from "vitest";
import { montarIndiceBarras, normalizarGtin, resolverCodigoBarras, unidadesCodigoBarras, type ProdutoBarras } from "./resolverCodigoBarras";
const p: ProdutoBarras = { sku: "PRTSALMD.ST.23/01833", cod_cadastro: "01833", ean: "0631911283369", dun: "10631911283366", nome_comercial: "Prato", inner_qtd: 1 };
const indice = montarIndiceBarras([p]);
describe("GTIN único", () => {
  it.each(["631911283369", "0631911283369", "00631911283369"])("%s resolve 01833 por EAN", (codigo) => {
    expect(resolverCodigoBarras(codigo, indice)).toMatchObject({ cod: "01833", sku: p.sku, tipo: "ean" });
  });
  it("DUN 10631911283366 resolve 01833 como caixa", () => {
    const codigo = resolverCodigoBarras("10631911283366", indice);
    expect(codigo).toMatchObject({ cod: "01833", tipo: "dun", innerQtd: 1 });
    expect(codigo && unidadesCodigoBarras(codigo, 3)).toBeNull();
  });
  it("código inexistente não resolve", () => { expect(resolverCodigoBarras("9999999999999", indice)).toBeNull(); });
  it("EAN8 e GTIN14 equivalentes", () => { expect(normalizarGtin("12345678")).toBe("00000012345678"); });
  it("não converte SKU alfanumérico para dígitos", () => { expect(normalizarGtin("SKU-01833")).toBe(""); });
  it("código exato não perde zeros", () => {
    expect(resolverCodigoBarras("01833", indice)?.tipo).toBe("cod");
    expect(resolverCodigoBarras("1833", indice)).toBeNull();
  });
  it("SKU literal case insensitive, sem curingas", () => {
    expect(resolverCodigoBarras(p.sku.toLowerCase(), indice)?.tipo).toBe("sku");
    expect(resolverCodigoBarras("%01833", indice)).toBeNull();
  });
  it("preserva EAN → cód → SKU → DUN em colisões", () => {
    const i = montarIndiceBarras([p, { ...p, sku: "631911283369", cod_cadastro: "631911283369", ean: null, dun: "00631911283369" }]);
    expect(resolverCodigoBarras("631911283369", i)?.tipo).toBe("ean");
    expect(resolverCodigoBarras("01833", montarIndiceBarras([p, { ...p, sku: "01833", ean: null, dun: null, cod_cadastro: null }]))?.tipo).toBe("cod");
  });
  it("DUN normalizado multiplica só inner, nunca múltiplos de venda", () => {
    const i = montarIndiceBarras([{ ...p, dun: "0631911283336", inner_qtd: 24 }]);
    const c = resolverCodigoBarras("631911283336", i);
    expect(c?.tipo).toBe("dun");
    expect(c && unidadesCodigoBarras(c, 3)).toBe(72);
  });
  it.each([null, 1])("inner %s pede unidades", (inner_qtd) => {
    const c = resolverCodigoBarras(p.dun ?? "", montarIndiceBarras([{ ...p, inner_qtd }]));
    expect(c && unidadesCodigoBarras(c, 5)).toBeNull();
  });
});
