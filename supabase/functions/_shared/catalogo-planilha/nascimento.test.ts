import { assertEquals, assert } from "jsr:@std/assert@1";
import { classificarPropostas, type Cartorio } from "./nascimento.ts";

const E = { livre: "7890000000017", livre2: "7890000000024", res: "7890000000031", uso: "7890000000048", morto: "7890000000055" };
const cart = new Map<string, Cartorio>([
  [E.livre, { ean: E.livre, cod_cadastro: null, dun: null, inner_qtd: null, situacao: "livre" }],
  [E.livre2, { ean: E.livre2, cod_cadastro: null, dun: null, inner_qtd: null, situacao: "livre" }],
  [E.res, { ean: E.res, cod_cadastro: "03001", dun: "17890000000038", inner_qtd: 6, situacao: "reservado" }],
  [E.uso, { ean: E.uso, cod_cadastro: "02001", dun: null, inner_qtd: 12, situacao: "em uso" }],
  [E.morto, { ean: E.morto, cod_cadastro: null, dun: null, inner_qtd: null, situacao: "morto" }],
]);
const so = (linhas: { cod?: unknown; ean?: unknown; inner?: unknown }[], cat: { cod: string; origem?: string }[] = []) =>
  classificarPropostas(linhas.map((l, i) => ({ linha: i + 5, cod: l.cod ?? null, ean: l.ean ?? null, inner: l.inner ?? null })), cart, cat.map((c, i) => ({ linha: i + 5, cod: c.cod, nome: "Vela", origem: c.origem ?? "Nacional" })));

Deno.test("EAN livre que ganhou código = reservar", () => {
  const r = so([{ cod: "3100", ean: E.livre, inner: 24 }]);
  assertEquals(r.cartorio, [{ tipo: "reservar", linha: 5, ean: E.livre, cod_cadastro: "03100", dun: null, inner_antes: null, inner_qtd: 24 }]);
  assertEquals(r.recusas, []);
});
Deno.test("inner diferente em reservado/em uso = mudar inner", () => {
  const r = so([{ cod: "03001", ean: E.res, inner: 8 }, { cod: "02001", ean: E.uso, inner: 10 }]);
  assertEquals(r.cartorio.map(p => [p.tipo, p.cod_cadastro, p.inner_antes, p.inner_qtd]), [["mudar_inner", "03001", 6, 8], ["mudar_inner", "02001", 12, 10]]);
});
Deno.test("linha igual ao cartório não propõe nada", () => {
  const r = so([{ cod: "03001", ean: E.res, inner: 6 }, { ean: E.livre }]);
  assertEquals(r.cartorio.length + r.recusas.length, 0);
});
Deno.test("recusa trocar EAN de código em uso", () => {
  const r = so([{ cod: "09999", ean: E.uso }]);
  assert(r.recusas[0].motivo.includes("em uso")); assertEquals(r.cartorio, []);
});
Deno.test("recusa EAN morto", () => { assert(so([{ cod: "03200", ean: E.morto }]).recusas[0].motivo.includes("morto")); });
Deno.test("recusa mesmo código em dois EANs", () => {
  const r = so([{ cod: "03300", ean: E.livre }, { cod: "03300", ean: E.livre2 }]);
  assertEquals(r.recusas.length, 2); assertEquals(r.cartorio, []);
});
Deno.test("recusa código que já existe em outro EAN", () => { assert(so([{ cod: "03001", ean: E.livre }]).recusas[0].motivo.includes(`EAN ${E.res}`)); });
Deno.test("recusa EAN que não existe no cartório", () => { assert(so([{ cod: "03400", ean: "7890000000062" }]).recusas[0].motivo.includes("não existe no cartório")); });
Deno.test("recusa inner < 1", () => {
  assert(so([{ cod: "03500", ean: E.livre, inner: 0 }]).recusas[0].motivo.includes("Inner"));
  assert(so([{ cod: "03001", ean: E.res, inner: -2 }]).recusas[0].motivo.includes("Inner"));
});
Deno.test("nascimento com par novo da aba 2 e com reserva já existente", () => {
  const r = so([{ cod: "03100", ean: E.livre, inner: 24 }], [{ cod: "03100" }, { cod: "03001", origem: "Importado" }]);
  assertEquals(r.nascimentos.map(n => [n.cod_cadastro, n.ean, n.inner_qtd, n.origem, n.reserva_na_planilha]), [["03100", E.livre, 24, "nacional", true], ["03001", E.res, 6, "importado", false]]);
});
Deno.test("código sem par em lugar nenhum = recusa", () => {
  const r = so([], [{ cod: "04000" }]);
  assertEquals(r.nascimentos, []); assertEquals(r.recusas[0].motivo, "Código sem EAN na aba Códigos e EAN.");
});
Deno.test("par recusado na aba 2 bloqueia o nascimento", () => {
  const r = so([{ cod: "03600", ean: E.morto }], [{ cod: "03600" }]);
  assertEquals(r.nascimentos, []); assert(r.recusas[1].motivo.startsWith("Par recusado"));
});
