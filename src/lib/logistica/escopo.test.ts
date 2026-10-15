import { describe, expect, it } from "vitest";
import { parametrosEscopo } from "./escopo";

describe("escopo da logística", () => {
  it("mantém custos ao escolher transportadora e remove canal", () => {
    const next = parametrosEscopo(new URLSearchParams("aba=custos&canal=b2b"), { tipo: "transportadora", valor: "braspress-sc" });
    expect(next.get("aba")).toBe("custos");
    expect(next.get("transportadora")).toBe("braspress-sc");
    expect(next.has("canal")).toBe(false);
  });
  it("mantém entregas ao escolher B2C e remove transportadora", () => {
    const next = parametrosEscopo(new URLSearchParams("aba=entregas&transportadora=braspress-sc"), { tipo: "canal", valor: "b2c" });
    expect(next.get("aba")).toBe("entregas");
    expect(next.get("canal")).toBe("b2c");
    expect(next.has("transportadora")).toBe(false);
  });
  it("Total limpa os dois escopos e preserva a aba", () => {
    const next = parametrosEscopo(new URLSearchParams("aba=tabelas&canal=b2b&transportadora=antiga"), { tipo: "canal", valor: "total" });
    expect(next.toString()).toBe("aba=tabelas");
  });
});