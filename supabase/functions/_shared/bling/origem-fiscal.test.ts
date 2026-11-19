import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { origensFiscaisCadastro } from "./origem-fiscal.ts";
Deno.test("origens do cadastro preservam nacional zero e importado dois sem default", () => {
  assertEquals([...origensFiscaisCadastro(["N", "I"], [{ sku: "N", origem_fisc: "0" }, { sku: "I", origem_fisc: "2" }])], [["N", 0], ["I", 2]]);
});
for (const origem of [null, undefined, "", "  ", "erro", NaN, Infinity, -1, 9, 2.5, false]) {
  Deno.test(`cadastro origem ${String(origem)} recusa sem converter para zero`, () => {
    assertThrows(() => origensFiscaisCadastro(["X", "Y", "X"], [{ sku: "X", origem_fisc: origem }]), Error, "SKU(s) sem origem fiscal no cadastro: X, Y — nada foi criado.");
  });
}
Deno.test("cadastro aceita somente inteiros de zero a oito", () => {
  const produtos = Array.from({ length: 9 }, (_, i) => ({ sku: String(i), origem_fisc: String(i) }));
  assertEquals([...origensFiscaisCadastro(produtos.map(p => p.sku), produtos).values()], [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});