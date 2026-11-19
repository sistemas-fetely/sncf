import { describe, expect, it } from "vitest";
import { mudarEixos, podeSalvarAgrupamento, titulosAlterados, type PreviaAgrupamento } from "./agrupamentoShopify";

const campos = ["cor", "estampa", "tamanho", "numero"].map((slug, ordem) => ({ slug, nome: slug, ordem }));
const previa: PreviaAgrupamento = { eixos: ["cor"], promovidos: [], total_skus: 2, total_pais: 1, problemas: 0, ja_publicado: false, pais: [] };
describe("Agrupamentos Shopify", () => {
  it("mantém no mínimo um eixo", () => expect(mudarEixos(["cor"], "cor", campos)).toEqual(["cor"]));
  it("não permite um quarto eixo", () => expect(mudarEixos(["cor", "estampa", "tamanho"], "numero", campos)).toEqual(["cor", "estampa", "tamanho"]));
  it("ordena os eixos pela dimensão", () => expect(mudarEixos(["numero"], "cor", campos)).toEqual(["cor", "numero"]));
  it("impede salvar quando há problemas", () => expect(podeSalvarAgrupamento({ ...previa, problemas: 1 }, true, false)).toBe(false));
  it("impede reagrupar publicado", () => expect(podeSalvarAgrupamento({ ...previa, ja_publicado: true }, true, false)).toBe(false));
  it("exige a permissão existente", () => expect(podeSalvarAgrupamento(previa, false, false)).toBe(false));
  it("não salva prévia em atualização", () => expect(podeSalvarAgrupamento(previa, true, true)).toBe(false));
  it("permite rascunho válido", () => expect(podeSalvarAgrupamento(previa, true, false)).toBe(true));
  it("envia somente títulos alterados dos pais atuais", () => {
    const pais = [{ chave: "a", chave_txt: "a", titulo: "Original", variantes_n: 2, problemas: 0, variantes: [] }];
    expect(titulosAlterados(pais, { a: "Original", antigo: "Não enviar" })).toEqual({});
    expect(titulosAlterados(pais, { a: "Editado", antigo: "Não enviar" })).toEqual({ a: "Editado" });
  });
});