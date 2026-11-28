import { describe, expect, it } from "vitest";
import { analisarCelulaLoja, canalDerivado, normalizarSimNao } from "../../supabase/functions/_shared/catalogo-planilha/lojas";
import { somenteLeitura } from "../../supabase/functions/_shared/catalogo-planilha/comparacao";

const DIM = [{ slug: "b2b", papel_canal: "b2b" }, { slug: "site", papel_canal: "b2c" }, { slug: "ml", papel_canal: null }, { slug: "shopee", papel_canal: null }, { slug: "tiktok", papel_canal: null }];

describe("Sim/Não das colunas de loja", () => {
  it("aceita sim/não/s/n/x/true/false em qualquer caixa", () => {
    for (const v of ["Sim", "SIM", "s", "S", "x", "X", "true", "TRUE", true]) expect(normalizarSimNao(v)).toBe("true");
    for (const v of ["Não", "NÃO", "nao", "n", "N", "false", "False", false]) expect(normalizarSimNao(v)).toBe("false");
  });
  it("vazio = sem mudança", () => { for (const v of [null, undefined, "", "   "]) expect(normalizarSimNao(v)).toBeNull(); });
  it("outra grafia é erro", () => expect(() => normalizarSimNao("talvez")).toThrow(/Sim ou Não/));
});

describe("canal_venda derivado das lojas", () => {
  it("b2b e site = ambos", () => expect(canalDerivado({ b2b: true, site: true }, DIM)).toBe("ambos"));
  it("só b2b = b2b", () => expect(canalDerivado({ b2b: true, site: false, ml: true }, DIM)).toBe("b2b"));
  it("só site = b2c", () => expect(canalDerivado({ b2b: false, site: true }, DIM)).toBe("b2c"));
  it("nenhum (mesmo vendendo em ML) = null", () => expect(canalDerivado({ ml: true, shopee: true }, DIM)).toBeNull());
  it("canal_venda nunca é célula gravável da planilha", () => expect(somenteLeitura("canal_venda")).toBe(true));
});

describe("classificação das células de loja", () => {
  it("sem base: semeia com o sistema e não acusa quando a planilha já concorda", () => expect(analisarCelulaLoja(undefined, "Sim", true).tipo).toBeNull());
  it("sem base e planilha diferente do sistema = mudança", () => expect(analisarCelulaLoja(undefined, "Sim", false)).toMatchObject({ tipo: "mudanca", valor_planilha: "true", valor_sistema: "false" }));
  it("planilha vazia = sem mudança", () => expect(analisarCelulaLoja("true", "", false).tipo).toBeNull());
  it("planilha igual à base = sem mudança", () => expect(analisarCelulaLoja("false", "não", true).tipo).toBeNull());
  it("base e sistema iguais, planilha diferente = mudança", () => expect(analisarCelulaLoja("false", "Sim", false).tipo).toBe("mudanca"));
  it("sistema já igual à planilha = ja_igual", () => expect(analisarCelulaLoja("false", "Sim", true).tipo).toBe("ja_igual"));
  it("sistema diverge da base e planilha diverge = conflito", () => expect(analisarCelulaLoja("true", "Não", null).tipo).toBe("conflito"));
  it("grafia inválida = erro com mensagem", () => expect(analisarCelulaLoja(undefined, "talvez", true)).toMatchObject({ tipo: "erro" }));
});
