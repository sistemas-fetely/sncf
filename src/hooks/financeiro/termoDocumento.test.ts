import { describe, it, expect } from "vitest";
import { termoDocumento } from "./useContaCliente";
describe("termoDocumento", () => {
  it("remove pontuação de CPF/CNPJ", () => {
    expect(termoDocumento("171.400")).toBe("171400");
    expect(termoDocumento("12.345.678/0001-90")).toBe("12345678000190");
  });
  it("mantém nomes", () => expect(termoDocumento("Maria 1")).toBe("Maria 1"));
});
