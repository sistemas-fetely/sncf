import { describe, expect, it } from "vitest";

import { mascarar, mascararMatriz, mascararValor, mensagemErroTermoRestrito } from "./mascararTermoRestrito";

const termos = [
  { padrao: "Fábrica Exemplo", rotulo: "ZL", ativo: true },
  { padrao: "Cidade Origem", rotulo: "origem", ativo: true },
];

describe("máscara de termos restritos", () => {
  it("ignora caixa e acentos", () => {
    expect(mascarar("Fabrica EXEMPLO — CIDADE origem", termos)).toBe("ZL — origem");
  });

  it("preserva valores não textuais", () => {
    expect(mascararValor(123, termos)).toBe(123);
    expect(mascararValor(null, termos)).toBeNull();
  });

  it("mascara nomes de aba e todas as células textuais", () => {
    expect(mascararMatriz({ "Fábrica Exemplo": [["Cidade Origem", 10]] }, termos)).toEqual({
      ZL: [["origem", 10]],
    });
  });

  it("traduz a recusa do gatilho para uma orientação clara", () => {
    expect(mensagemErroTermoRestrito(new Error("TERMO RESTRITO: bloqueado"))).toContain("termo sigiloso");
  });
});