import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { alinharOrigemCard } from "./origem.ts";

Deno.test("origem divergente corrige 2 para 0 e preserva os demais atributos tributários", () => {
  const atual = { tributacao: { origem: 2, grupoProduto: { id: 123 }, ncm: "8215" } };
  const card = structuredClone(atual);
  assertEquals(alinharOrigemCard("0", atual, card), { tipo: "divergencia", de: "2", para: "0" });
  assertEquals(card.tributacao, { origem: 0, grupoProduto: { id: 123 }, ncm: "8215" });
  assertEquals(atual.tributacao.origem, 2);
});

Deno.test("origem igual numericamente não altera o card", () => {
  const card = { tributacao: { origem: 0 } };
  assertEquals(alinharOrigemCard("0", card, card), { tipo: "igual" });
  assertEquals(card.tributacao, { origem: 0 });
});

for (const origem of [null, undefined, "", "  ", "inválida", NaN, Infinity, -1, 9, 2.5, false]) {
  Deno.test(`SNCF sem origem válida (${String(origem)}) pula sem default`, () => {
    const card = { tributacao: { origem: 2 } };
    assertEquals(alinharOrigemCard(origem, card, card), { tipo: "pulado", motivo: "SNCF sem origem" });
    assertEquals(card.tributacao.origem, 2);
  });
}

Deno.test("detecção só informa divergência sem modificar origem no Bling", () => {
  const atual = { tributacao: { origem: 2 } };
  assertEquals(alinharOrigemCard("0", atual), { tipo: "divergencia", de: "2", para: "0" });
  assertEquals(atual.tributacao.origem, 2);
});