import { describe, expect, it } from "vitest";
import { mmAaaa, saldosAnterioresDoExtrato } from "./extratoMensal";

describe("saldo em aberto transportado", () => {
  it("rotula a linha saldo_anterior com o mês apurado da origem e mantém o valor", () => {
    const r = saldosAnterioresDoExtrato([
      { tipo: "liberacao", valor: 100 },
      { tipo: "saldo_anterior", extrato_origem_id: "x", competencia_origem: "2026-09-01", sequencia_origem: 1, valor: 42.5, motivo: "Saldo em aberto de 10/2026 (sem documento fiscal)" },
    ]);
    // O `motivo` congelado é ignorado — a frase vem sempre da competência de origem.
    expect(r).toEqual([{ k: "x", rotulo: "Saldo em aberto de 08/2026", valor: 42.5, motivo: "Competência 08/2026 fechada sem nota fiscal — segue neste extrato" }]);
  });
  it("formata MM/AAAA", () => expect(mmAaaa("2026-11-01")).toBe("11/2026"));
});
