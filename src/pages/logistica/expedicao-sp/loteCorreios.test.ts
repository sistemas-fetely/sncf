import { describe, it, expect } from "vitest";
import { loteCorreiosValido } from "./EstacaoDespacho";

describe("lote Correios", () => {
  it("libera com todos os códigos válidos e distintos", () => {
    expect(loteCorreiosValido(["AA123456789BR", "ab 987654321 br"])).toBe(true);
  });
  it("bloqueia com código vazio", () => {
    expect(loteCorreiosValido(["AA123456789BR", ""])).toBe(false);
  });
  it("bloqueia código fora do formato", () => {
    expect(loteCorreiosValido(["AA12345678BR"])).toBe(false);
  });
  it("bloqueia código repetido no lote", () => {
    expect(loteCorreiosValido(["AA123456789BR", "aa123456789br"])).toBe(false);
  });
});
