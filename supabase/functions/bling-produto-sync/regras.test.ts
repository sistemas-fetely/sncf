import { describe, expect, test } from "bun:test";
import { comparar, montarPatch, exigirEscrita, type Campo } from "./regras.ts";
const campos: Campo[] = [
  { campo: "pesoBruto", origem: "peso_g", destino: "pesoBruto", tipo: "numero", divisor: 1000 },
  { campo: "pesoLiquido", origem: "peso_g", destino: "pesoLiquido", tipo: "numero", divisor: 1000 },
  ...["altura", "largura", "profundidade"].map((c) => ({ campo: c, origem: `${c}_cm`, destino: `dimensoes.${c}`, tipo: "numero" as const })),
  { campo: "gtin", origem: "ean", destino: "gtin", tipo: "texto" },
  { campo: "gtinEmbalagem", origem: "dun", destino: "gtinEmbalagem", tipo: "texto" },
  { campo: "ncm", origem: "ncm", destino: "tributacao.ncm", tipo: "digitos" },
  { campo: "cest", origem: "cest", destino: "tributacao.cest", tipo: "digitos" },
  { campo: "marca", origem: "marca", destino: "marca", tipo: "texto" },
  { campo: "itensPorCaixa", origem: "multiplos", destino: "itensPorCaixa", tipo: "numero" },
];
describe("Cadastro SNCF → Bling F1", () => {
  test("peso_g/1000 vai nos dois pesos em kg", () => { expect(montarPatch(comparar({ peso_g: 250 }, {}, campos))).toEqual({ pesoBruto: 0.25, pesoLiquido: 0.25 }); });
  test("dimensões são cm com unidadeMedida 1 e PATCH parcial", () => { expect(montarPatch(comparar({ altura_cm: 12, largura_cm: 20, profundidade_cm: 3 }, {}, campos))).toEqual({ dimensoes: { altura: 12, largura: 20, profundidade: 3, unidadeMedida: 1 } }); });
  test("EAN preserva zeros e mapeia para gtin", () => { expect(montarPatch(comparar({ ean: "0631911283932" }, {}, campos))).toEqual({ gtin: "0631911283932" }); });
  test("DUN mapeia para gtinEmbalagem", () => { expect(montarPatch(comparar({ dun: "10631911283939" }, {}, campos))).toEqual({ gtinEmbalagem: "10631911283939" }); });
  test("NCM normaliza sem pontos e fica dentro de tributacao", () => { expect(comparar({ ncm: "3406.00.00" }, { tributacao: { ncm: "34060000" } }, campos)).toEqual([]); expect(montarPatch(comparar({ ncm: "3406.00.00" }, {}, campos))).toEqual({ tributacao: { ncm: "34060000" } }); });
  test("CEST normaliza sem pontos", () => { expect(montarPatch(comparar({ cest: "28.001.00" }, {}, campos))).toEqual({ tributacao: { cest: "2800100" } }); });
  test("marca vai somente em marca", () => { expect(montarPatch(comparar({ marca: "Fetély" }, {}, campos))).toEqual({ marca: "Fetély" }); });
  test("multiplos vai em itensPorCaixa", () => { expect(montarPatch(comparar({ multiplos: 6 }, {}, campos))).toEqual({ itensPorCaixa: 6 }); });
  test("vazio/nulo/zero nunca apagam Bling", () => { for (const v of [null, "", "  ", 0, "0"]) expect(comparar(Object.fromEntries(campos.map((c) => [c.origem, v])), { pesoBruto: 12, gtin: "123" }, campos)).toEqual([]); });
  test("tolerância numérica 0,001", () => { expect(comparar({ peso_g: 1000 }, { pesoBruto: 1.001, pesoLiquido: 1.001 }, campos)).toEqual([]); expect(comparar({ peso_g: 1000 }, { pesoBruto: 1.002, pesoLiquido: 1 }, campos)).toHaveLength(1); });
  test("campos proibidos nunca entram em PATCH", () => { expect(() => montarPatch([{ campo: "nome", destino: "nome", valor_sncf: "A", valor_bling: "B" }])).toThrow("fora da Fase 1"); });
  test("escrita desligada impede aplicação", () => { expect(() => exigirEscrita({ escrita_habilitada: false })).toThrow("Nenhum produto foi enviado"); expect(() => exigirEscrita({ escrita_habilitada: true })).not.toThrow(); });
});