import { assertEquals } from "jsr:@std/assert@1";
import { precisaDetalhe, resolverProduto, type Mapas } from "./resolver.ts";
const p = { sku: "VNRFM.SC.5.0", cod_cadastro: "02160" };
const m = (): Mapas => ({ canonico: new Map([["111", "vnrfm.sc.5.0"], ["222", "SEM.SNCF"]]), cache: new Map([["333", "02160"], ["222", "VNRFM.SC.5.0"]]), sncf: new Map([["VNRFM.SC.5.0", p], ["02160", p]]) });
Deno.test("canônico resolve primeiro", () => assertEquals(resolverProduto(111, m()), p));
Deno.test("fallback no cache quando canônico não casa no SNCF", () => assertEquals(resolverProduto("222", m()), p));
Deno.test("cache casa por cod_cadastro", () => assertEquals(resolverProduto(333, m()), p));
Deno.test("sem casamento = vínculo quebrado", () => assertEquals(resolverProduto(999, m()), null));
Deno.test("sem produto Bling = vínculo quebrado", () => assertEquals(resolverProduto(null, m()), null));
Deno.test("detalhe: novo, completo e mudança", () => {
  const e = { preco: 24.9, situacao: 1, titulo: "A" };
  assertEquals(precisaDetalhe({ preco: { valor: 24.9 }, situacao: 1, titulo: "A" }, e, false), false);
  assertEquals(precisaDetalhe({ preco: { valor: 24.9 }, situacao: 1, titulo: "A" }, e, true), true);
  assertEquals(precisaDetalhe({ preco: { valor: 25 }, situacao: 1, titulo: "A" }, e, false), true);
  assertEquals(precisaDetalhe({ preco: { valor: 24.9 }, situacao: 3, titulo: "A" }, e, false), true);
  assertEquals(precisaDetalhe({}, undefined, false), true);
});
Deno.test("float do Bling não conta como mudança", () => assertEquals(precisaDetalhe({ preco: { valor: 24.9 }, situacao: 1, titulo: "A" }, { preco: 24.899999618530273, situacao: 1, titulo: "A" }, false), false));
