import { describe, expect, it } from "vitest";
import { parsePrazosCondicao, podeSalvarCondicaoRapida } from "./condicaoPagamentoRapida";

describe("prazos do cadastro rápido", () => {
  it.each(["60/90", "60,90", "60 90", "60-90"])("aceita %s", (texto) => {
    expect(parsePrazosCondicao(texto)).toEqual([60, 90]);
  });
  it("preserva a entrada na primeira posição e o limite 365", () => {
    expect(parsePrazosCondicao("0/30/60/365")).toEqual([0, 30, 60, 365]);
  });
  it("deixa validação de prazo e ordem para o banco sem ordenar nem truncar", () => {
    expect(parsePrazosCondicao("366/30/30")).toEqual([366, 30, 30]);
  });
  it.each(["30x/60", "30.5/60", "-30/60", "30/", "abc"])("recusa sintaxe inválida %s", (texto) => {
    expect(parsePrazosCondicao(texto)).toBeNull();
  });
  it("não solicita prévia sem números", () => expect(parsePrazosCondicao("  ")).toEqual([]));
});

describe("salvamento do cadastro rápido", () => {
  it("permite criar uma condição nova", () => expect(podeSalvarCondicaoRapida("nova", true, false)).toBe(true));
  it("permite reativar uma condição inativa", () => expect(podeSalvarCondicaoRapida("ja_existe_inativa", true, false)).toBe(true));
  it("bloqueia uma condição já ativa", () => expect(podeSalvarCondicaoRapida("ja_existe_ativa", true, false)).toBe(false));
  it("bloqueia prévia antiga", () => expect(podeSalvarCondicaoRapida("nova", false, false)).toBe(false));
  it("bloqueia durante requisições", () => expect(podeSalvarCondicaoRapida("nova", true, true)).toBe(false));
  it("bloqueia prévia ausente ou com erro", () => expect(podeSalvarCondicaoRapida(undefined, true, false)).toBe(false));
});