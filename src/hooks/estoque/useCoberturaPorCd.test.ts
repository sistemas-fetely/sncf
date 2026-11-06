import { describe, expect, it } from "vitest";
import { normalizarItensCobertura } from "./useCoberturaPorCd";

describe("normalizarItensCobertura", () => {
  it("soma o mesmo SKU, ignora vazios e qtd ≤ 0 e ordena", () => {
    expect(normalizarItensCobertura([
      { sku: "B", qtd: 2 }, { sku: " A ", qtd: 1 }, { sku: "B", qtd: 3 }, { sku: "", qtd: 4 }, { sku: "C", qtd: 0 },
    ])).toEqual([{ sku: "A", qtd: 1 }, { sku: "B", qtd: 5 }]);
  });
});
