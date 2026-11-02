import { describe, expect, it } from "vitest";
import { saldosNegativosTi } from "./saldoOrigemTi";

describe("saldo atual da origem da TI", () => {
  it("lista somente itens com fiscal_sadio menor que zero, preservando o saldo atual", () => {
    expect(saldosNegativosTi([
      { sku: "A", fiscal_sadio: -12 },
      { sku: "B", fiscal_sadio: "-0.5" },
      { sku: "C", fiscal_sadio: 0 },
      { sku: "D", fiscal_sadio: 8 },
      { sku: "E", fiscal_sadio: null },
    ])).toEqual([{ sku: "A", saldo: -12 }, { sku: "B", saldo: -0.5 }]);
  });

  it("remove o aviso quando o saldo é regularizado, sem depender da observação histórica", () => {
    expect(saldosNegativosTi([{ sku: "A", fiscal_sadio: -154 }])).toHaveLength(1);
    expect(saldosNegativosTi([{ sku: "A", fiscal_sadio: 0 }])).toEqual([]);
    expect(saldosNegativosTi([{ sku: "A", fiscal_sadio: 154 }])).toEqual([]);
  });
});