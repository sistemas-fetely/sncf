import { describe, it, expect } from "vitest";
import { lerOrdemKD, escreverOrdemKD, lerConjunto, escreverConjunto, resolverAcao } from "@/lib/navegacao/codecUrl";

describe("codecUrl", () => {
  it("ordenação ida e volta; sem ordenação vira 'nenhum' (não cai no default)", () => {
    expect(lerOrdemKD(escreverOrdemKD({ key: "data_compra", dir: "desc" }))).toEqual({ key: "data_compra", dir: "desc" });
    expect(escreverOrdemKD(null)).toBe("nenhum");
    expect(lerOrdemKD("nenhum")).toBeNull();
    expect(lerOrdemKD("x:lixo")).toBeNull();
  });
  it("conjunto vazio vira 'nenhum'; cheio volta igual", () => {
    expect(escreverConjunto(new Set())).toBe("nenhum");
    expect([...lerConjunto("nenhum")]).toEqual([]);
    expect([...lerConjunto(escreverConjunto(new Set(["pago", "em_aberto"])))]).toEqual(["em_aberto", "pago"]);
  });
  it("resolverAcao aceita valor ou função", () => {
    expect(resolverAcao(3, 1)).toBe(3);
    expect(resolverAcao((p: number) => p + 1, 1)).toBe(2);
  });
});
