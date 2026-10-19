import { describe, expect, it } from "vitest";
import { montarIndiceCodigo, resolverCodigo } from "./useCodigoProdutoMap";

const idx = montarIndiceCodigo([{ cod_cadastro: "02028", sku: "CL-EH-TRV-30-HAL" }]);

describe("resolverCodigo", () => {
  it("resolve sku para cod_cadastro, ignorando caixa e espaços", () => {
    expect(resolverCodigo(idx, " cl-eh-trv-30-hal ")).toEqual({ cod: "02028", sku: "CL-EH-TRV-30-HAL", cadastrado: true });
  });
  it("aceita o próprio cod_cadastro como chave", () => {
    expect(resolverCodigo(idx, "02028").sku).toBe("CL-EH-TRV-30-HAL");
  });
  it("sku sem cadastro cai no fallback", () => {
    expect(resolverCodigo(idx, "XX-1")).toEqual({ cod: null, sku: "XX-1", cadastrado: false });
  });
});
