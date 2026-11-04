import { describe, expect, it } from "vitest";
import { mmAaaa, saldosAnterioresDoExtrato } from "./extratoMensal";

describe("saldo em aberto transportado", () => {
  it("rotula a linha saldo_anterior com a competência de origem e mantém o valor", () => {
    const r = saldosAnterioresDoExtrato([
      { tipo: "liberacao", valor: 100 },
      { tipo: "saldo_anterior", extrato_origem_id: "x", competencia_origem: "2026-09-01", sequencia_origem: 1, valor: 42.5, motivo: "sem documento" },
    ]);
    expect(r).toEqual([{ k: "x", rotulo: "Saldo em aberto de 09/2026", valor: 42.5, motivo: "sem documento" }]);
  });
  it("formata MM/AAAA", () => expect(mmAaaa("2026-11-01")).toBe("11/2026"));
});
