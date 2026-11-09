import { describe, it, expect } from "vitest";
import { temDiferenca, semContagemValida, type LinhaDiferenca } from "./diferencaConciliacao";

const base: LinhaDiferenca = { real: null, fiscal: 0, delta_virtual_real: 0, shopify_diff: 0, bling_diff: 0, nf_pendente: null, tem_baixa_pendente: false, causas: [] };
const vencida = [{ regra: "estoque_contagem_vencida" }];

describe("temDiferenca", () => {
  it("contagem vencida sem diferença numérica fica fora", () => {
    expect(temDiferenca({ ...base, real: 0, fiscal: 0, causas: vencida })).toBe(false);
    expect(semContagemValida({ fonte_real: "contagem", fiscal: 0, contagem_vencida: true })).toBe(true);
  });
  it("vencida com real ≠ fiscal entra pela diferença numérica", () => {
    expect(temDiferenca({ ...base, real: 0, fiscal: 29, causas: vencida })).toBe(true);
  });
  it("diferença numérica real × fiscal entra", () => {
    expect(temDiferenca({ ...base, real: 3, fiscal: 5 })).toBe(true);
  });
  it("real nulo não conta como diferença por si só", () => {
    expect(temDiferenca({ ...base, real: null, fiscal: 5 })).toBe(false);
  });
  it("diferença nos canais entra", () => {
    expect(temDiferenca({ ...base, shopify_diff: 2 })).toBe(true);
    expect(temDiferenca({ ...base, bling_diff: -1 })).toBe(true);
  });
  it("NF pendente entra; zero não", () => {
    expect(temDiferenca({ ...base, nf_pendente: 4 })).toBe(true);
    expect(temDiferenca({ ...base, nf_pendente: 0 })).toBe(false);
  });
  it("baixa pendente e outra causa entram", () => {
    expect(temDiferenca({ ...base, tem_baixa_pendente: true })).toBe(true);
    expect(temDiferenca({ ...base, causas: [{ regra: "outra" }] })).toBe(true);
  });
  it("nunca contado com fiscal ≠ 0 é sem contagem válida", () => {
    expect(semContagemValida({ fonte_real: "sem_contagem", fiscal: 3, contagem_vencida: false })).toBe(true);
    expect(semContagemValida({ fonte_real: "sem_contagem", fiscal: 0, contagem_vencida: false })).toBe(false);
  });
});
