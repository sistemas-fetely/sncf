import { describe, it, expect } from "vitest";
import { skusAplicaveisLote, podeAplicarDiferencas, skusComDiferenca, documentoContagem } from "./aplicarContagemLote";
import type { LinhaCorrecao } from "./correcaoConciliacao";

const valida: LinhaCorrecao = { fonte_real: "contagem", contagem_vencida: false, real: 0, fiscal: 29, correcao: "contagem" };
const linhas: Record<string, Record<string, LinhaCorrecao>> = {
  "SITE-SP": { A: valida, B: { ...valida, real: 29 }, C: { ...valida, contagem_vencida: true }, D: valida },
  "XPM-SC": { A: valida },
};
const get = (s: string, c: string) => linhas[c]?.[s];

describe("skusAplicaveisLote", () => {
  it("só entram os aplicáveis do centro", () => {
    expect(skusAplicaveisLote(["A", "B", "C", "D", "E"], get, ["SITE-SP"], true)).toEqual(["A", "D"]);
  });
  it("exige exatamente um centro no escopo", () => {
    expect(skusAplicaveisLote(["A"], get, [], true)).toEqual([]);
    expect(skusAplicaveisLote(["A"], get, ["SITE-SP", "XPM-SC"], true)).toEqual([]);
  });
  it("considera o recorte inteiro, não só a página", () => {
    const todas = Array.from({ length: 120 }, (_, i) => (i % 2 ? "A" : `X${i}`)).concat(["D"]);
    expect(skusAplicaveisLote(todas, get, ["SITE-SP"], true)).toEqual(["A", "D"]);
  });
  it("sem super admin nada é aplicável", () => {
    expect(skusAplicaveisLote(["A"], get, ["SITE-SP"], false)).toEqual([]);
  });
});

describe("botão do Inventário", () => {
  it("aparece só com divergências e super admin", () => {
    expect(podeAplicarDiferencas([{ diferenca: -29 }], true)).toBe(true);
    expect(podeAplicarDiferencas([{ diferenca: -29 }], false)).toBe(false);
    expect(podeAplicarDiferencas([], true)).toBe(false);
    expect(podeAplicarDiferencas(undefined, true)).toBe(false);
  });
  it("SKUs e documento", () => {
    expect(skusComDiferenca([{ sku: "A", diferenca: 2 }, { sku: "B", diferenca: 0 }])).toEqual(["A"]);
    expect(documentoContagem("2026-11-09")).toBe("Contagem de 09/11/2026");
  });
});
