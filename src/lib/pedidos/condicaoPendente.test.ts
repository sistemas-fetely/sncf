import { describe, it, expect } from "vitest";
import { temCondicaoPendente, validarDias, previaParcelas, rotuloProposto, ehMotivoCondicaoPendente } from "./condicaoPendente";

const base = { estagio: "recebido", recebido_via: "api", canal: "B2B", condicao_pagamento_id: null };

describe("condição pendente", () => {
  it("pendente quando FOP, recebido, não B2C, sem vínculo e gera título", () => {
    expect(temCondicaoPendente(base, true)).toBe(true);
  });
  it("B2C não entra", () => expect(temCondicaoPendente({ ...base, canal: "B2C" }, true)).toBe(false));
  it("vinculado não entra", () => expect(temCondicaoPendente({ ...base, condicao_pagamento_id: "x" }, true)).toBe(false));
  it("fora de recebido não entra", () => expect(temCondicaoPendente({ ...base, estagio: "cobranca" }, true)).toBe(false));
  it("manual não entra", () => expect(temCondicaoPendente({ ...base, recebido_via: "manual" }, true)).toBe(false));
  it("natureza sem título não entra", () => expect(temCondicaoPendente(base, false)).toBe(false));
  it("motivos de pendência", () => {
    expect(ehMotivoCondicaoPendente("condicao_nao_mapeada")).toBe(true);
    expect(ehMotivoCondicaoPendente("condicao_nao_reconhecida")).toBe(true);
    expect(ehMotivoCondicaoPendente("forma_nao_reconhecida")).toBe(false);
  });
  it("prazos crescentes de 0 a 365", () => {
    expect(validarDias([10, 30])).toBeNull();
    expect(validarDias([30, 10])).not.toBeNull();
    expect(validarDias([10, 10])).not.toBeNull();
    expect(validarDias([366])).not.toBeNull();
    expect(validarDias([])).not.toBeNull();
  });
  it("rótulo e parcelas", () => {
    expect(rotuloProposto("boleto", [10, 30])).toBe("Boleto 10/30 (2 parcelas)");
    const p = previaParcelas(100, [0, 10, 20], new Date(2026, 0, 1));
    expect(p.map((x) => x.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(p[1].data.getDate()).toBe(11);
  });
});
