import { describe, it, expect } from "vitest";
import { loteCorreiosValido } from "./EstacaoDespacho";

describe("lote Correios", () => {
  it("libera com todos os códigos válidos e distintos", () => {
    expect(loteCorreiosValido(["QN259507570BR", "oy 744873880 br"])).toBe(true);
  });
  it("bloqueia com código vazio", () => {
    expect(loteCorreiosValido(["QN259507570BR", ""])).toBe(false);
  });
  it("bloqueia código fora do formato", () => {
    expect(loteCorreiosValido(["AA12345678BR"])).toBe(false);
  });
  it("bloqueia dígito de controle inválido", () => {
    expect(loteCorreiosValido(["QN259507570BR", "QN253507583BR"])).toBe(false);
  });
  it("bloqueia código repetido no lote", () => {
    expect(loteCorreiosValido(["QN259507570BR", "qn259507570br"])).toBe(false);
  });
});
