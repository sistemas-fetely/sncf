import { describe, expect, it } from "vitest";
import { calcularJurosCartao } from "./juros-cartao";

describe("calcularJurosCartao", () => {
  it("cliente paga: total = principal × (1 + taxa)", () => {
    expect(calcularJurosCartao(1000, 8.5, "cliente")).toEqual({ principal: 1000, juros: 85, total: 1085, semTaxa: false });
  });
  it("Fetely paga: juros zero e total = principal", () => {
    expect(calcularJurosCartao(1000, 8.5, "fetely")).toEqual({ principal: 1000, juros: 0, total: 1000, semTaxa: false });
  });
  it("cliente sem taxa cadastrada fica bloqueado", () => {
    expect(calcularJurosCartao(1000, null, "cliente").semTaxa).toBe(true);
  });
  it("Fetely sem taxa cadastrada pode seguir", () => {
    expect(calcularJurosCartao(1000, null, "fetely").semTaxa).toBe(false);
  });
});
