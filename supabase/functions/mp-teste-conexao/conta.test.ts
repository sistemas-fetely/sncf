import { codigoConta } from "./conta.ts";

Deno.test("sem conta usa MP-SHOPIFY", () => {
  if (codigoConta({}) !== "MP-SHOPIFY") throw new Error("Default incorreto");
});
Deno.test("conta enviada preserva MP-MELI", () => {
  if (codigoConta({ conta: "MP-MELI" }) !== "MP-MELI") throw new Error("Conta incorreta");
});
Deno.test("recusa conta inválida antes de consultar o cofre", () => {
  for (const body of [null, [], { conta: 1 }, { conta: "" }]) {
    let recusou = false;
    try { codigoConta(body); } catch { recusou = true; }
    if (!recusou) throw new Error("Entrada inválida aceita");
  }
});