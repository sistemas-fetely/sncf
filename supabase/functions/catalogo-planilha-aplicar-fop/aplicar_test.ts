import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { aplicarNoFop, classificarResultados, lotes, mesmoValor, montarItens, type CelulaFop, type ResultadoFop } from "../_shared/catalogo-planilha/aplicar-fop.ts";

const L = "00000000-0000-0000-0000-00000000000a";
const cel = (id: string, tipo = "mudanca", extra: Partial<CelulaFop> = {}): CelulaFop => ({ id, cod_cadastro: `C${id}`, campo: "categoria", dono: "produto", tipo, status: "pendente", leitura_id: L, valor_planilha: "Nova", valor_sistema: "Velha", ...extra });
const quem = { id: "u1", nome: "Teste" };

Deno.test("mesmoValor compara número e texto por valor primitivo", () => {
  assertEquals(mesmoValor("2", 2), true);
  assertEquals(mesmoValor("2", 3), false);
});

Deno.test("mesmoValor considera null, undefined e texto em branco vazios", () => {
  assertEquals(mesmoValor(null, ""), true);
  assertEquals(mesmoValor(undefined, "  "), true);
  assertEquals(mesmoValor(null, undefined), true);
  assertEquals(mesmoValor(null, 0), false);
});

Deno.test("mesmoValor ignora espaços nas pontas do texto", () => {
  assertEquals(mesmoValor("Importado", "Importado "), true);
  assertEquals(mesmoValor("Importado", "Nacional"), false);
});

Deno.test("mesmoValor compara objetos e arrays por JSON.stringify", () => {
  assertEquals(mesmoValor({ valor: 2 }, { valor: 2 }), true);
  assertEquals(mesmoValor(["Importado", 2], ["Importado", 2]), true);
  assertEquals(mesmoValor({ valor: 2 }, { valor: "2" }), false);
  assertEquals(mesmoValor([2], [3]), false);
});

Deno.test("conflito com valor igual vira aplicada para mudança e resolver para conflito escolhido planilha", () => {
  const cs = [
    cel("1", "mudanca", { dono: "operacoes", campo: "origem_fisc", valor_planilha: "2", valor_sistema: null }),
    cel("2", "conflito", { campo: "origem_prod", valor_planilha: "Importado", valor_sistema: "" }),
  ];
  const c = classificarResultados(montarItens(cs, ["1", "2"], L), cs, { resultados: [
    { id: "1", status: "conflito", valor_atual: 2 },
    { id: "2", status: "conflito", valor_atual: "Importado " },
  ] });
  assertEquals(c, { aplicar: ["1"], resolver: ["2"], pendentes: [] });
});

Deno.test("FOP fake: conflito falso conclui por dono sem registrar pendências", async () => {
  const cs = [
    cel("1", "mudanca", { dono: "operacoes", campo: "origem_fisc", valor_planilha: "2", valor_sistema: null }),
    cel("2", "conflito", { campo: "origem_prod", valor_planilha: "Importado", valor_sistema: "" }),
  ];
  const { log, deps } = fakeDeps(async () => ({ resultados: [
    { id: "1", status: "conflito", valor_atual: 2 },
    { id: "2", status: "conflito", valor_atual: "Importado " },
  ] }));
  const r = await aplicarNoFop(cs, ["1", "2"], L, quem, deps);
  assertEquals(r, { aplicadas: 2, conflitos: 0, erros: 0, lotes: 1 });
  assertEquals(log.concluir, [[["1"], "aplicar", "operacoes"], [["2"], "resolver"]]);
  assertEquals(log.registrar, []);
});

function fakeDeps(fop: (corpo: { celulas: { id: string }[] }) => Promise<unknown>) {
  const log = { concluir: [] as [string[], string, string?][], registrar: [] as ResultadoFop[], chamadas: [] as number[] };
  return { log, deps: {
    chamarFop: (c: { celulas: { id: string }[] }) => { log.chamadas.push(c.celulas.length); return fop(c); },
    concluir: async (ids: string[], acao: "aplicar" | "resolver", dono?: string) => { log.concluir.push(dono === "produto" ? [ids, acao] : [ids, acao, dono]); },
    registrar: async (p: ResultadoFop[]) => { log.registrar.push(...p); },
  } };
}

Deno.test("payload usa valor da planilha e valor esperado do sistema; conflito envia o valor atual", () => {
  const itens = montarItens([cel("1"), cel("2", "conflito", { valor_sistema: "Atual FOP" })], ["1", "2"], L);
  assertEquals(itens[0], { id: "1", cod_cadastro: "C1", campo: "categoria", valor_novo: "Nova", valor_esperado: "Velha" });
  assertEquals(itens[1].valor_esperado, "Atual FOP");
});

Deno.test("recusa dono fora de produto/operacoes ou de outra leitura", () => {
  let erro = "";
  try { montarItens([cel("1", "mudanca", { dono: "outro" })], ["1"], L); } catch (e) { erro = (e as Error).message; }
  assertEquals(erro.includes("não vai ao FOP"), true);
  try { montarItens([cel("1", "mudanca", { leitura_id: "x" })], ["1"], L); } catch (e) { erro = (e as Error).message; }
  assertEquals(erro.includes("leitura atual"), true);
});

Deno.test("lotes de até 500", () => {
  assertEquals(lotes(Array.from({ length: 1001 }, (_, i) => i)).map(l => l.length), [500, 500, 1]);
});

Deno.test("mapeia aplicada/conflito/erro e célula sem resposta", () => {
  const cs = [cel("1"), cel("2", "conflito"), cel("3"), cel("4"), cel("5")];
  const itens = montarItens(cs, ["1", "2", "3", "4", "5"], L);
  const c = classificarResultados(itens, cs, { resultados: [
    { id: "1", status: "aplicada" }, { id: "2", status: "aplicada" },
    { id: "3", status: "conflito", valor_atual: "Outra" }, { id: "4", status: "erro", erro: "Categoria inexistente" },
  ] });
  assertEquals(c.aplicar, ["1"]);
  assertEquals(c.resolver, ["2"]);
  assertEquals(c.pendentes, [
    { id: "3", status: "conflito", valor_atual: "Outra" },
    { id: "4", status: "erro", erro: "Categoria inexistente" },
    { id: "5", status: "erro", erro: "FOP não respondeu esta célula." },
  ]);
});

Deno.test("FOP fake: sucesso marca aplicada", async () => {
  const { log, deps } = fakeDeps(async c => ({ resultados: c.celulas.map(x => ({ id: x.id, status: "aplicada" })) }));
  const r = await aplicarNoFop([cel("1"), cel("2")], ["1", "2"], L, quem, deps);
  assertEquals(r.aplicadas, 2);
  assertEquals(log.concluir, [[["1", "2"], "aplicar"]]);
  assertEquals(log.registrar, []);
});

Deno.test("FOP fake: conflito fica pendente com o valor atual do FOP", async () => {
  const { log, deps } = fakeDeps(async () => ({ resultados: [{ id: "1", status: "conflito", valor_atual: "Do FOP" }] }));
  const r = await aplicarNoFop([cel("1")], ["1"], L, quem, deps);
  assertEquals([r.aplicadas, r.conflitos], [0, 1]);
  assertEquals(log.concluir, []);
  assertEquals(log.registrar, [{ id: "1", status: "conflito", valor_atual: "Do FOP" }]);
});

Deno.test("FOP fake: erro fica pendente com a mensagem", async () => {
  const { log, deps } = fakeDeps(async () => ({ resultados: [{ id: "1", status: "erro", erro: "Valor fora da lista" }] }));
  const r = await aplicarNoFop([cel("1")], ["1"], L, quem, deps);
  assertEquals(r.erros, 1);
  assertEquals(log.concluir, []);
  assertEquals(log.registrar[0].erro, "Valor fora da lista");
});

Deno.test("FOP fake: rede caída não aplica nada e registra o erro na célula", async () => {
  const { log, deps } = fakeDeps(async () => { throw new TypeError("connection refused"); });
  await assertRejects(() => aplicarNoFop([cel("1")], ["1"], L, quem, deps), Error, "Nenhuma célula deste lote foi aplicada");
  assertEquals(log.concluir, []);
  assertEquals(log.registrar, [{ id: "1", status: "erro", erro: "Falha ao falar com o FOP: connection refused" }]);
});

Deno.test("FOP fake: resposta sem lista não aplica nada e registra o erro", async () => {
  const { log, deps } = fakeDeps(async () => ({ ok: true }));
  await assertRejects(() => aplicarNoFop([cel("1")], ["1"], L, quem, deps), Error, "sem lista");
  assertEquals(log.concluir.length, 0);
  assertEquals(log.registrar[0].status, "erro");
});

Deno.test("FOP fake: 1001 células em 3 lotes", async () => {
  const cs = Array.from({ length: 1001 }, (_, i) => cel(String(i)));
  const { log, deps } = fakeDeps(async c => ({ resultados: c.celulas.map(x => ({ id: x.id, status: "aplicada" })) }));
  const r = await aplicarNoFop(cs, cs.map(c => c.id), L, quem, deps);
  assertEquals(log.chamadas, [500, 500, 1]);
  assertEquals(r.aplicadas, 1001);
});

Deno.test("FOP fake: HTTP 404 vira erro registrado na célula", async () => {
  const { log, deps } = fakeDeps(async () => { throw new Error("HTTP 404 — Not Found"); });
  await assertRejects(() => aplicarNoFop([cel("1")], ["1"], L, quem, deps), Error, "HTTP 404");
  assertEquals(log.registrar[0].erro, "Falha ao falar com o FOP: HTTP 404 — Not Found");
});

Deno.test("aceita célula de Operações (fiscal) no payload", () => {
  const itens = montarItens([cel("1", "mudanca", { dono: "operacoes", campo: "ncm", valor_planilha: "1234.56.78", valor_sistema: null })], ["1"], L);
  assertEquals(itens, [{ id: "1", cod_cadastro: "C1", campo: "ncm", valor_novo: "1234.56.78", valor_esperado: null }]);
});

Deno.test("FOP fake: concluir agrupa por dono (aplicar e resolver)", async () => {
  const { log, deps } = fakeDeps(async c => ({ resultados: c.celulas.map(x => ({ id: x.id, status: "aplicada" })) }));
  const cs = [cel("1"), cel("2", "mudanca", { dono: "operacoes", campo: "ncm" }), cel("3", "conflito", { dono: "operacoes", campo: "cest" }), cel("4", "mudanca", { dono: "operacoes", campo: "origem_fisc" })];
  const r = await aplicarNoFop(cs, ["1", "2", "3", "4"], L, quem, deps);
  assertEquals(r.aplicadas, 4);
  assertEquals(log.concluir, [[["1"], "aplicar"], [["2", "4"], "aplicar", "operacoes"], [["3"], "resolver", "operacoes"]]);
});
