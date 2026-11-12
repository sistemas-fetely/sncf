import { expect, it } from "vitest";
import { filtrarEstoqueSiteSp, juntarColecoesSiteSp } from "./estoqueSiteSp";

const saldos = [
  { sku: "V1", nome_comercial: "Vela", disponivel: 12, reservado: 2 },
  { sku: "P1", nome_comercial: "Prato", disponivel: 0, reservado: 3 },
  { sku: "Z1", nome_comercial: "Zerado", disponivel: 0, reservado: 0 },
];
it("resolve coleção por SKU e código da dimensão", () => {
  expect(juntarColecoesSiteSp(saldos, [{ sku: "V1", colecao: "gold" }], [{ codigo: "gold", rotulo: "Golden" }]).map((linha) => linha.colecao)).toEqual(["Golden", null, null]);
});
it("inclui saldo disponível ou reservado, sem recalcular disponibilidade", () => {
  const linhas = juntarColecoesSiteSp(saldos, [], []);
  expect(filtrarEstoqueSiteSp(linhas, "", []).map((linha) => [linha.sku, linha.disponivel])).toEqual([["V1", 12], ["P1", 0]]);
});
it("combina busca por SKU/nome e coleções por E", () => {
  const linhas = juntarColecoesSiteSp(saldos, [{ sku: "V1", colecao: "gold" }], [{ codigo: "gold", rotulo: "Golden" }]);
  expect(filtrarEstoqueSiteSp(linhas, "vela", ["Golden"]).map((linha) => linha.sku)).toEqual(["V1"]);
  expect(filtrarEstoqueSiteSp(linhas, "p1", []).map((linha) => linha.sku)).toEqual(["P1"]);
  expect(filtrarEstoqueSiteSp(linhas, "prato", ["Golden"])).toEqual([]);
});