import { describe, expect, it } from "vitest";
import { podeGerarRemessaTi } from "./nfRemessaTi";

describe("geração de remessa TI", () => {
  it("permite geração inicial", () => expect(podeGerarRemessaTi(undefined, false)).toBe(true));
  it("permite retentar erro", () => expect(podeGerarRemessaTi("erro", false)).toBe(true));
  it("impede novo rascunho", () => expect(podeGerarRemessaTi("rascunho", false)).toBe(false));
  it("impede repetir transmissão", () => expect(podeGerarRemessaTi("transmitida", false)).toBe(false));
  it("impede geração concorrente", () => expect(podeGerarRemessaTi("gerando", false)).toBe(false));
  it("NF autorizada prevalece sobre erro do registro", () => expect(podeGerarRemessaTi("erro", true)).toBe(false));
});