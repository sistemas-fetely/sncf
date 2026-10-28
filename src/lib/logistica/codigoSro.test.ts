import { describe, it, expect } from "vitest";
import { sroDigitoConfere, erroCodigoSro } from "./codigoSro";

describe("dígito verificador SRO", () => {
  it.each(["OY744873880BR", "QN259507606BR", "QN259507570BR", "qn 259507570 br"])("aceita %s", (c) => {
    expect(sroDigitoConfere(c)).toBe(true);
    expect(erroCodigoSro(c)).toBeNull();
  });
  it.each(["QN253507570BR", "QN253507583BR", "QN253507597BR"])("recusa %s", (c) => {
    expect(sroDigitoConfere(c)).toBe(false);
    expect(erroCodigoSro(c)).toBe("Dígito de controle não confere");
  });
  it("recusa formato errado", () => {
    expect(erroCodigoSro("QN25950757BR")).toBe("Formato AA123456789BR");
  });
});
