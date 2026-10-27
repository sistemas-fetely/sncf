import { describe, expect, it } from "vitest";
import {
  detalhePartes,
  detalheQtd,
  somarDetalhe,
  temDesvio,
  tooltipDetalhe,
} from "./cockpit-detalhe";

describe("detalhamento do Cockpit do Estoque", () => {
  it("Site SP: 6.515 contábeis = 3.802 sadio + 2.713 a caminho, sem bloqueado", () => {
    expect(detalheQtd(6515, 3802, 2713)).toEqual({ sadio: 3802, caminho: 2713, bloqueado: 0 });
  });

  it("XPM SC: o que sobra do contábil é bloqueado (1.189.823 vende · 368 bloqueado)", () => {
    const d = detalheQtd(1190191, 1189823, 0);
    expect(d.bloqueado).toBe(368);
    expect(detalhePartes(d)).toEqual(["368 bloqueado"]);
  });

  it("tudo sadio não tem desvio", () => {
    expect(temDesvio(detalheQtd(100, 100, 0))).toBe(false);
    expect(detalhePartes(detalheQtd(100, 100, 0))).toEqual([]);
  });

  it("a caminho e bloqueado juntos: só o que é maior que zero aparece", () => {
    const d = detalheQtd(10, 7, 2);
    expect(d.bloqueado).toBe(1);
    expect(detalhePartes(d)).toEqual(["2 a caminho", "1 bloqueado"]);
    expect(detalhePartes(d, true)).toEqual(["2 a caminho", "1 bloq."]);
  });

  it("a sobra nunca é negativa", () => {
    expect(detalheQtd(10, 8, 5).bloqueado).toBe(0);
  });

  it("sem as colunas novas, tudo é bloqueado", () => {
    expect(detalheQtd(5, null, null)).toEqual({ sadio: 0, caminho: 0, bloqueado: 5 });
    expect(temDesvio(detalheQtd(5, null, null))).toBe(true);
  });

  it("somar centros soma as três condições", () => {
    const a = detalheQtd(6515, 3802, 2713);
    const b = detalheQtd(1190191, 1189823, 0);
    expect(somarDetalhe(a, b)).toEqual({ sadio: 1193625, caminho: 2713, bloqueado: 368 });
  });

  it("tooltip traz as três condições", () => {
    expect(tooltipDetalhe(detalheQtd(10, 7, 2))).toBe("Sadio 7 · A caminho 2 · Bloqueado 1");
  });
});
