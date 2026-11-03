import { describe, expect, it } from "vitest";
import { linkExpirado, percentualRemessa, precisaRetomar } from "./remessaPacote";

const agora = Date.parse("2026-11-03T12:00:00Z");

describe("precisaRetomar", () => {
  it("retoma quando a rotina pausou por tempo", () => {
    expect(precisaRetomar("gerando", { pausado: true, atualizado_em: "2026-11-03T11:59:59Z" }, agora)).toBe(true);
  });
  it("retoma quando o último sinal tem mais de 90 s", () => {
    expect(precisaRetomar("gerando", { atualizado_em: "2026-11-03T11:58:29Z" }, agora)).toBe(true);
  });
  it("não retoma com sinal recente", () => {
    expect(precisaRetomar("gerando", { atualizado_em: "2026-11-03T11:59:00Z" }, agora)).toBe(false);
  });
  it("nunca retoma remessa pronta ou com erro", () => {
    expect(precisaRetomar("pronto", { pausado: true }, agora)).toBe(false);
    expect(precisaRetomar("erro", { pausado: true }, agora)).toBe(false);
  });
});

describe("percentualRemessa", () => {
  it("pronto é 100", () => expect(percentualRemessa("pronto", {})).toBe(100));
  it("metade dos arquivos fica no meio da barra", () => {
    expect(percentualRemessa("gerando", { etapa: "zip", entradas: new Array(100), feitos: 50 })).toBe(52);
  });
});

describe("linkExpirado", () => {
  it("vencido antes de agora", () => expect(linkExpirado("2026-11-03T11:00:00Z", agora)).toBe(true));
  it("válido depois de agora", () => expect(linkExpirado("2026-12-03T11:00:00Z", agora)).toBe(false));
  it("sem data conta como expirado", () => expect(linkExpirado(null, agora)).toBe(true));
});
