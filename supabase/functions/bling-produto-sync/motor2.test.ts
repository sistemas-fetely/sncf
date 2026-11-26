import { describe, expect, test } from "bun:test";
import { comparar, montarPatch, camposDoBanco, camposEmMassa, enriquecerFonte, fiscaisPreservados, MOTOR_POR_CAMPO } from "./regras.ts";
import { criarRitmo } from "./ritmo.ts";
const fase = new Map([["ativo", "A"], ["registrado", "I"]]);
const grupos = { nomePorId: new Map([[10, "L1 - Produto Nacional Importado"], [20, "L2 - Produto Nacional"]]), idPorNome: new Map([["l1 - produto nacional importado", 10], ["l2 - produto nacional", 20]]) };
const c = (k: string) => MOTOR_POR_CAMPO[k];
describe("Motor Bling — campos novos", () => {
  test("nome compara texto e vai em nome", () => { const d = comparar({ nome_operacional: "Vela 5" }, { nome: "Vela 05" }, c("nome_operacional")); expect(montarPatch(d)).toEqual({ nome: "Vela 5" }); });
  test("preço com tolerância 0,005 e SNCF vazio/0 sem divergência", () => {
    expect(comparar({ preco_varejo: 10.004 }, { preco: 10 }, c("preco_varejo"))).toEqual([]);
    expect(comparar({ preco_varejo: 10.01 }, { preco: 10 }, c("preco_varejo")).length).toBe(1);
    expect(comparar({ preco_varejo: 0 }, { preco: 10 }, c("preco_varejo"))).toEqual([]);
    expect(comparar({ preco_varejo: null }, { preco: 10 }, c("preco_varejo"))).toEqual([]);
  });
  test("situação pela fase com regra", () => { const f = enriquecerFonte({ fase: "registrado" }, fase); expect(montarPatch(comparar(f, { situacao: "A" }, c("fase")))).toEqual({ situacao: "I" }); });
  test("fase sem regra não compara e registra motivo", () => { const f = enriquecerFonte({ fase: "pre_venda" }, fase); expect(comparar(f, { situacao: "A" }, c("fase"))).toEqual([]); expect(f.avisos[0]).toContain("fase sem regra"); });
  test("grupo tributário pelo nome do card e envio por id", () => {
    const f = enriquecerFonte({ fase: "ativo", origem_fisc: "2" }, fase);
    const d = comparar(f, { tributacao: { grupoProduto: { id: 20 } } }, c("grupo_tributario"), { grupos });
    expect(d[0].valor_bling).toBe("L2 - Produto Nacional");
    expect(montarPatch(d, f, { grupos })).toEqual({ tributacao: { grupoProduto: { id: 10 } } });
    expect(comparar(f, { tributacao: { grupoProduto: { id: 10 } } }, c("grupo_tributario"), { grupos })).toEqual([]);
  });
  test("grupo inexistente no Bling é erro do produto", () => { const d = [{ campo: "grupoTributario", destino: "tributacao.grupoProduto", valor_sncf: "L9", valor_bling: null }]; expect(() => montarPatch(d, {}, { grupos })).toThrow("não existe no Bling"); });
  test("origem fiscal sempre comparada e tributacao parte do GET atual", () => {
    const { campos } = camposDoBanco([]);
    const atual = { tributacao: { ncm: "34060000", cest: "2800100", origem: 0, grupoProduto: { id: 20 } } };
    const d = comparar({ origem_fisc: "2" }, atual, campos);
    expect(d.map((x) => x.campo)).toEqual(["origem"]);
    expect(montarPatch(d, {}, {}, atual)).toEqual({ tributacao: { ncm: "34060000", cest: "2800100", origem: 2, grupoProduto: { id: 20 } } });
    expect(comparar({ origem_fisc: "" }, atual, campos)).toEqual([]);
  });
  test("fiscal não pedido que muda é recusado", () => {
    expect(() => fiscaisPreservados({ tributacao: { ncm: "1", origem: 0 } }, { tributacao: { ncm: "2", origem: 2 } }, ["origem"])).toThrow("ncm");
    expect(() => fiscaisPreservados({ tributacao: { ncm: "1", origem: 0 } }, { tributacao: { ncm: "1", origem: 2 } }, ["origem"])).not.toThrow();
  });
});
describe("Campos decididos pelo banco", () => {
  const linhas = [{ campo: "peso_g", sobrescreve: false }, { campo: "dun", sobrescreve: true }, { campo: "altura_cm", sobrescreve: true }, { campo: "sku", sobrescreve: false }, { campo: "origem_fisc", sobrescreve: false }, { campo: "novo_x", sobrescreve: true }];
  test("mapeia, ignora sku/origem_fisc e avisa campo sem motor", () => {
    const { campos, avisos } = camposDoBanco(linhas);
    expect(campos.map((x) => x.campo)).toEqual(["pesoBruto", "pesoLiquido", "gtinEmbalagem", "altura", "origem"]);
    expect(avisos[0]).toContain("novo_x");
  });
  test("aplicar envia só sobrescreve (+unidadeMedida com dimensão, +origem fiscal)", () => {
    expect([...camposEmMassa(camposDoBanco(linhas).campos)].sort()).toEqual(["altura", "gtinEmbalagem", "origem", "unidadeMedida"]);
  });
});
describe("Limitador de ritmo", () => {
  test("espera só o que falta desde o início da chamada anterior", async () => {
    let t = 0; const dormidas: number[] = [];
    const ritmo = criarRitmo(350, () => t, async (ms) => { dormidas.push(ms); t += ms; });
    await ritmo(); t += 100; await ritmo(); t += 600; await ritmo();
    expect(dormidas).toEqual([250]);
  });
  test("chamadas concorrentes ficam espaçadas", async () => {
    let t = 0; const dormidas: number[] = [];
    const ritmo = criarRitmo(350, () => t, async (ms) => { dormidas.push(ms); });
    await Promise.all([ritmo(), ritmo(), ritmo()]);
    expect(dormidas).toEqual([350, 700]);
  });
});
