import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aprenderOpcoes, sugerirOpcao, type Irma } from "./sugestao.ts";

const irmas: Irma[] = [
  ...["5", "7"].flatMap((tamanho) => ["0", "N"].map((numero) => ({
    sku: `VNAPM.SC.${tamanho}.${numero}`,
    cadastro: { cor: "Azul", estampa: "Azul Perolado Metalizado", familia: "Sweet Candy", tamanho_numero: `${tamanho} cm` },
    opcoes: [{ name: "Tamanho", value: `${tamanho}CM` }, { name: "Cor", value: "Azul Pérola Metálico" }, { name: "Número", value: numero }],
  }))),
  ...["0", "N"].map((numero) => ({
    sku: `VNROM.SC.7.${numero}`,
    cadastro: { cor: "Rosé", estampa: "Rosé Perolado Metalizado", familia: "Sweet Candy", tamanho_numero: "7 cm" },
    opcoes: [{ name: "Tamanho", value: "7CM" }, { name: "Cor", value: "Rose Ouro Metálico" }, { name: "Número", value: numero }],
  })),
];
const novo = { cor: "Rosé", estampa: "Rosé Perolado Metalizado", familia: "Sweet Candy", tamanho_numero: "5 cm" };
const aprendizado = aprenderOpcoes(["Tamanho", "Cor", "Número"], irmas);

Deno.test("Sweet Candy: tamanho 5 cm aprende 5CM, sem copiar a irmã 7 cm", () => {
  assertEquals(sugerirOpcao("Tamanho", "VNRFM.SC.5.N", novo, aprendizado, "7CM"), { nome: "Tamanho", valor: "5CM", origem: "aprendido de tamanho_numero" });
});
Deno.test("Sweet Candy: Rosé aprende Rose Ouro Metálico mesmo com nomes distintos", () => {
  assertEquals(sugerirOpcao("Cor", "VNRFM.SC.5.N", novo, aprendizado, "Azul Pérola Metálico"), { nome: "Cor", valor: "Rose Ouro Metálico", origem: "aprendido de cor" });
});
Deno.test("Sweet Candy: Número N vem do último segmento do SKU", () => {
  assertEquals(sugerirOpcao("Número", "VNRFM.SC.5/N", novo, aprendizado, "0"), { nome: "Número", valor: "N", origem: "aprendido de sufixo" });
});
Deno.test("sufixo é a origem quando família e sufixo concordam na numeração", () => {
  const comFamilia = irmas.map((i) => ({ ...i, cadastro: { ...i.cadastro, familia: `Número ${i.sku.split('.').at(-1)}` } }));
  const mapa = aprenderOpcoes(["Número"], comFamilia);
  assertEquals(sugerirOpcao("Número", "VNRFM.SC.5.N", { ...novo, familia: "Número N" }, mapa, "0"), { nome: "Número", valor: "N", origem: "aprendido de sufixo" });
});
Deno.test("atributo com conflito normalizado não determina a opção", () => {
  const conflito = aprenderOpcoes(["Cor"], [...irmas, { ...irmas[0], cadastro: { cor: "AZUL" }, opcoes: [{ name: "Cor", value: "Verde" }] }]);
  assertEquals(conflito.get("Cor")?.some((d) => d.atributo === "cor"), false);
});
Deno.test("um único valor distinto não determina a opção", () => {
  const unico = aprenderOpcoes(["Cor"], [irmas[0], { ...irmas[0], sku: "VNAPM.SC.5.0", cadastro: { cor: "ÁZUL", estampa: "Azul Perolado Metalizado", familia: "Sweet Candy", tamanho_numero: "5 cm" } }]);
  assertEquals(unico.get("Cor"), []);
});
Deno.test("atributos determinantes que divergem deixam valor vazio", () => {
  assertEquals(sugerirOpcao("Cor", "VNRFM.SC.5.N", { ...novo, estampa: "Azul Perolado Metalizado" }, aprendizado, "Azul Pérola Metálico"), { nome: "Cor", valor: "", origem: "conferir: atributos divergem" });
});
Deno.test("cor realmente nova usa estampa antes de cor", () => {
  assertEquals(sugerirOpcao("Cor", "VNVER.SC.5.N", { ...novo, cor: "Verde", estampa: "Verde Perolado Metalizado" }, aprendizado, "Azul Pérola Metálico"), { nome: "Cor", valor: "Verde Perolado Metalizado", origem: "valor novo do cadastro (estampa)" });
});
Deno.test("valor novo prefere cor quando a estampa não está preenchida", () => {
  assertEquals(sugerirOpcao("Cor", "VNVER.SC.5.N", { ...novo, cor: "Verde", estampa: null }, aprendizado, "Azul"), { nome: "Cor", valor: "Verde", origem: "valor novo do cadastro (cor)" });
});
Deno.test("tamanho realmente novo usa o tamanho do cadastro", () => {
  assertEquals(sugerirOpcao("Tamanho", "VNRFM.SC.9.N", { ...novo, tamanho_numero: "9 cm" }, aprendizado, "7CM"), { nome: "Tamanho", valor: "9 cm", origem: "valor novo do cadastro (tamanho_numero)" });
});
Deno.test("sem determinantes mantém irmã com sinal de conferência", () => {
  assertEquals(sugerirOpcao("Outro", "VNRFM.SC.5.N", novo, aprendizado, "Padrão"), { nome: "Outro", valor: "Padrão", origem: "igual à irmã — conferir" });
});
Deno.test("sem atributo preenchido não copia outra cor", () => {
  assertEquals(sugerirOpcao("Cor", "VNRFM.SC.5.N", {}, aprendizado, "Azul"), { nome: "Cor", valor: "", origem: "conferir: cadastro sem valor" });
});