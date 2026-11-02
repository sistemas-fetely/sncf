import { describe, it, expect } from "vitest";
import { lerPlanilhaTabelaPreco, lerCodigoPorKg, variacaoDestacada, variacaoPct, payloadTarifa } from "./planilhaTabelaPreco";

const cabIcaro = ["", "", "", 0.9999999999999999, 2, 7.999999999999999, "VALOR EXCEDENTE", "ADV", "GRISD"];

describe("planilha por kg (Icaro)", () => {
  it("lê código, prazo, pesos arredondados e taxas", () => {
    const r = lerPlanilhaTabelaPreco([cabIcaro, ["CTP-CAPITAL-AC-11-0", 11, "x", 375.9999999999999, 400, 410, 12.5, 0.65, 0.35]]);
    expect(r.layout).toBe("por_kg");
    const t = r.tarifas[0];
    expect(t.tarifa_code).toBe("CAPITAL-AC");
    expect(t.uf).toBe("AC");
    expect(t.prazo).toBe(11);
    expect(t.pesos).toEqual({ "1": 376, "2": 400, "8": 410 });
    expect(t.kg_adicional).toBe(12.5);
    expect(t.adv_pct).toBe(0.65);
    expect(t.gris_pct).toBe(0.35);
    expect(t.erros).toEqual([]);
  });

  it("trava código repetido citando as linhas (caso CTP-CAPITAL-RR-14-0)", () => {
    const l = ["CTP-CAPITAL-RR-14-0", 14, "", 1, 2, 3, 1, 0.65, 0.35];
    const r = lerPlanilhaTabelaPreco([cabIcaro, l, l]);
    expect(r.tarifas.every((t) => t.erros.some((e) => e.includes("repetido nas linhas 2, 3")))).toBe(true);
  });

  it("bloqueia peso vazio, UF e tipo inválidos", () => {
    const r = lerPlanilhaTabelaPreco([cabIcaro, ["CTP-METRO-XX-1-0", 1, "", "", 2, 3, 1, 0.65, 0.35]]);
    const e = r.tarifas[0].erros.join("|");
    expect(e).toContain("tipo");
    expect(e).toContain("UF");
    expect(e).toContain("peso 1 kg");
  });

  it("avisa (sem bloquear) preço que cai com o peso", () => {
    const r = lerPlanilhaTabelaPreco([cabIcaro, ["CTP-INTERIOR-PA-9-0", 9, "", 10, 9, 11, 1, 0.65, 0.35]]);
    expect(r.tarifas[0].erros).toEqual([]);
    expect(r.tarifas[0].avisos.length).toBe(1);
  });

  it("código INTERIOR vira INTERIOR-UF", () => {
    expect(lerCodigoPorKg("CTP-INTERIOR-AM-20-1").tarifa_code).toBe("INTERIOR-AM");
  });
});

describe("planilha de faixas fixas", () => {
  it("manda pesos ate_N e fpk no payload (fim do preço NULL)", () => {
    const r = lerPlanilhaTabelaPreco([
      ["tarifa_code", "uf", "zona_nome", "ate_10", "ate_20", "fpk", "fv_pct", "txa"],
      ["SC01", "SC", "Capital", "30,50", 40, 1.2, 0.3, 5],
    ]);
    expect(r.layout).toBe("faixas_fixas");
    const p = payloadTarifa(r.tarifas[0]);
    expect(p.pesos).toEqual({ ate_10: 30.5, ate_20: 40 });
    expect(p.kg_adicional).toBe(1.2);
    expect(p.modelo_peso).toBe("faixas_fixas");
  });
});

describe("variação", () => {
  it("destaca acima de ±20%", () => {
    expect(variacaoDestacada(variacaoPct(100, 121))).toBe(true);
    expect(variacaoDestacada(variacaoPct(100, 80))).toBe(false);
    expect(variacaoDestacada(variacaoPct(100, 79))).toBe(true);
  });
});
