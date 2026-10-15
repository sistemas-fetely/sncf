import { describe, expect, it } from "vitest";
import { temAbatimentoAcerto, valorAPagarAcerto } from "./acertoValores";

describe("valorAPagarAcerto", () => {
  it("casa real ACE-202610-001: 1.891,19 vendidos com 124,55 de abatimento paga 1.766,64", () => {
    expect(valorAPagarAcerto({ valor_total: 1891.19, valor_abatimento: 124.55 })).toBe(1766.64);
  });

  it("sem abatimento o a pagar é o próprio valor_total", () => {
    expect(valorAPagarAcerto({ valor_total: 500, valor_abatimento: 0 })).toBe(500);
    expect(valorAPagarAcerto({ valor_total: 500, valor_abatimento: null })).toBe(500);
    expect(valorAPagarAcerto({ valor_total: null })).toBe(0);
  });

  it("não deixa ruído de ponto flutuante nos centavos", () => {
    expect(valorAPagarAcerto({ valor_total: 0.3, valor_abatimento: 0.1 })).toBe(0.2);
  });
});

describe("temAbatimentoAcerto", () => {
  it("só mostra a linha de abatimento quando há valor", () => {
    expect(temAbatimentoAcerto({ valor_total: 1891.19, valor_abatimento: 124.55 })).toBe(true);
    expect(temAbatimentoAcerto({ valor_total: 500, valor_abatimento: 0 })).toBe(false);
    expect(temAbatimentoAcerto({ valor_total: 500, valor_abatimento: null })).toBe(false);
    expect(temAbatimentoAcerto({ valor_total: 500 })).toBe(false);
  });
});
