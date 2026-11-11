import { describe, expect, test } from "bun:test";
import { comparar, montarPatch, exigirEscrita, dentroDoFiltro, confirmarCodigo, type Campo } from "./regras.ts";
import { innerConfirmado } from "./inner.ts";
const campos: Campo[] = [
  { campo: "pesoBruto", origem: "peso_g", destino: "pesoBruto", tipo: "numero", divisor: 1000 },
  { campo: "pesoLiquido", origem: "peso_g", destino: "pesoLiquido", tipo: "numero", divisor: 1000 },
  ...["altura", "largura", "profundidade"].map((c) => ({ campo: c, origem: `${c}_cm`, destino: `dimensoes.${c}`, tipo: "numero" as const })),
  { campo: "gtin", origem: "ean", destino: "gtin", tipo: "texto" },
  { campo: "gtinEmbalagem", origem: "dun", destino: "gtinEmbalagem", tipo: "texto" },
  { campo: "ncm", origem: "ncm", destino: "tributacao.ncm", tipo: "digitos" },
  { campo: "cest", origem: "cest", destino: "tributacao.cest", tipo: "digitos" },
  { campo: "marca", origem: "marca", destino: "marca", tipo: "texto" },
  { campo: "itensPorCaixa", origem: "inner_qtd", destino: "itensPorCaixa", tipo: "numero" },
];
describe("Cadastro SNCF → Bling F1", () => {
  test("peso_g/1000 vai nos dois pesos em kg", () => { expect(montarPatch(comparar({ peso_g: 250 }, {}, campos))).toEqual({ pesoBruto: 0.25, pesoLiquido: 0.25 }); });
  test("dimensões completas em cm", () => { const fonte = { altura_cm: 12, largura_cm: 20, profundidade_cm: 3 }; expect(montarPatch(comparar(fonte, {}, campos), fonte)).toEqual({ dimensoes: { altura: 12, largura: 20, profundidade: 3, unidadeMedida: 1 } }); });
  test("EAN preserva zeros e mapeia para gtin", () => { expect(montarPatch(comparar({ ean: "0631911283932" }, {}, campos))).toEqual({ gtin: "0631911283932" }); });
  test("DUN mapeia para gtinEmbalagem", () => { expect(montarPatch(comparar({ dun: "10631911283939" }, {}, campos))).toEqual({ gtinEmbalagem: "10631911283939" }); });
  test("NCM normaliza sem pontos e fica dentro de tributacao", () => { expect(comparar({ ncm: "3406.00.00" }, { tributacao: { ncm: "34060000" } }, campos)).toEqual([]); expect(montarPatch(comparar({ ncm: "3406.00.00" }, {}, campos))).toEqual({ tributacao: { ncm: "34060000" } }); });
  test("CEST normaliza sem pontos", () => { expect(montarPatch(comparar({ cest: "28.001.00" }, {}, campos))).toEqual({ tributacao: { cest: "2800100" } }); });
  test("marca vai somente em marca", () => { expect(montarPatch(comparar({ marca: "Fetély" }, {}, campos))).toEqual({ marca: "Fetély" }); });
  test("inner confirmado 12 envia 12 e nunca múltiplo 6", () => { expect(montarPatch(comparar({ multiplos: 6, inner_qtd: 12, inner_confirmado: true }, {}, campos))).toEqual({ itensPorCaixa: 12 }); });
  test("inner maior que 1 é confirmado sem importação", () => { expect(innerConfirmado(24, false)).toBe(true); });
  test("inner 1 exige evidência da importação", () => { expect(innerConfirmado(1, false)).toBe(false); expect(innerConfirmado(1, true)).toBe(true); });
  test("inner não confirmado é ignorado", () => { expect(comparar({ inner_qtd: 1, inner_confirmado: false, multiplos: 24 }, { itensPorCaixa: 24 }, campos)).toEqual([]); });
  test("inner 1 confirmado pode substituir 24", () => { expect(montarPatch(comparar({ inner_qtd: 1, inner_confirmado: true }, { itensPorCaixa: 24 }, campos))).toEqual({ itensPorCaixa: 1 }); });
  test("origem comercial é recusada mesmo se configurada", () => { expect(() => comparar({ multiplos: 6 }, {}, [{ campo: "itensPorCaixa", origem: "multiplos", destino: "itensPorCaixa", tipo: "numero" }])).toThrow("exige origem inner_qtd"); });
  test("inner ausente zero ou inválido nunca confirma", () => { for (const n of [null, 0, -1, 1.5, "x"]) expect(innerConfirmado(n, true)).toBe(false); });
  test("envio restrito a itensPorCaixa exclui cest e dimensões", () => { const i = comparar({ inner_qtd: 24, inner_confirmado: true, cest: "2800100", altura_cm: 2 }, {}, campos).filter((d) => dentroDoFiltro({ sku: "A", campo: d.campo }, { campos: ["itensPorCaixa"] })); expect(montarPatch(i)).toEqual({ itensPorCaixa: 24 }); });
  test("vazio/nulo/zero nunca apagam Bling", () => { for (const v of [null, "", "  ", 0, "0"]) expect(comparar(Object.fromEntries(campos.map((c) => [c.origem, v])), { pesoBruto: 12, gtin: "123" }, campos)).toEqual([]); });
  test("tolerância numérica 0,001", () => { expect(comparar({ peso_g: 1000 }, { pesoBruto: 1.001, pesoLiquido: 1.001 }, campos)).toEqual([]); expect(comparar({ peso_g: 1000 }, { pesoBruto: 1.002, pesoLiquido: 1 }, campos)).toHaveLength(1); });
  test("campos proibidos nunca entram em PATCH", () => { expect(() => montarPatch([{ campo: "nome", destino: "nome", valor_sncf: "A", valor_bling: "B" }])).toThrow("fora da Fase 1"); });
  test("escrita desligada impede aplicação", () => { expect(() => exigirEscrita({ escrita_habilitada: false })).toThrow("Nenhum produto foi enviado"); expect(() => exigirEscrita({ escrita_habilitada: true })).not.toThrow(); });
  test("21.2/6.9/3.1 iguais com unidade 2 divergem só em unidadeMedida", () => {
    const d = comparar({ altura_cm: 21.2, largura_cm: 6.9, profundidade_cm: 3.1 }, { dimensoes: { altura: 21.2, largura: 6.9, profundidade: 3.1, unidadeMedida: 2 } }, campos);
    expect(d).toEqual([{ campo: "unidadeMedida", destino: "dimensoes.unidadeMedida", valor_sncf: 1, valor_bling: 2 }]);
    expect(montarPatch(d, { altura_cm: 21.2, largura_cm: 6.9, profundidade_cm: 3.1 })).toEqual({ dimensoes: { altura: 21.2, largura: 6.9, profundidade: 3.1, unidadeMedida: 1 } });
  });
  test("dimensões iguais em cm não divergem", () => { expect(comparar({ altura_cm: 21.2, largura_cm: 6.9, profundidade_cm: 3.1 }, { dimensoes: { altura: 21.2, largura: 6.9, profundidade: 3.1, unidadeMedida: 1 } }, campos)).toEqual([]); });
  test("sem dimensão SNCF não altera unidade Bling", () => { expect(comparar({ altura_cm: 0, largura_cm: null, profundidade_cm: "" }, { dimensoes: { unidadeMedida: 2 } }, campos)).toEqual([]); });
  test("dimensão realmente diferente e unidade incorreta são diferenças separadas", () => { expect(comparar({ altura_cm: 21.2 }, { dimensoes: { altura: 20, unidadeMedida: 2 } }, campos).map((i) => i.campo)).toEqual(["altura", "unidadeMedida"]); });
  test("filtro autorizado mantém itensPorCaixa e cest fora do envio", () => {
    const skus = ["TALGARGRDPRT.LA/01878", "TALGARGRDVEM.LA/01886", "TALGARGRDVER.LA/01883"];
    const itens = [...skus, "OUTRO"].flatMap((sku) => ["unidadeMedida", "itensPorCaixa", "cest"].map((campo) => ({ sku, campo })));
    expect(itens.filter((i) => dentroDoFiltro(i, { skus, campos: ["unidadeMedida"] }))).toEqual(skus.map((sku) => ({ sku, campo: "unidadeMedida" })));
  });
  test("sem filtros preserva todos; filtros vazios nunca enviam", () => {
    const i = { sku: "A", campo: "cest" };
    expect(dentroDoFiltro(i, {})).toBe(true);
    expect(dentroDoFiltro(i, { skus: [] })).toBe(false);
    expect(dentroDoFiltro(i, { campos: [] })).toBe(false);
  });
  test("dimensões incompletas recusam PATCH em vez de zerar medidas", () => { expect(() => montarPatch([{ campo: "unidadeMedida", destino: "dimensoes.unidadeMedida", valor_sncf: 1, valor_bling: 2 }], { altura_cm: 21.2 })).toThrow("Dimensão SNCF inválida"); });
  test("confirma ID resolvido e código externo sem vínculo legado", () => {
    expect(() => confirmarCodigo({ id: 16668802225, codigo: "01886" }, "01886", "16668802225")).not.toThrow();
    expect(() => confirmarCodigo({ id: 16668802225, codigo: "OUTRO" }, "01886", "16668802225")).toThrow("Vínculo Bling mudou");
    expect(() => confirmarCodigo({ id: 1, codigo: "01886" }, "01886", "16668802225")).toThrow("Vínculo Bling mudou");
  });
});