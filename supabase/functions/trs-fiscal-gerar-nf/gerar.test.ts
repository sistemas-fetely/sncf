import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CNPJ_MATRIZ, gerarTrs, payloadTrs, recusaTrs, valorTrs, type DadosTrs, type Registro } from "./gerar.ts";
const d: DadosTrs = { codigo: "TRS-0020", naturezaId: 15110073811, lojaId: 206045757, contato: { id: 18041940230, numeroDocumento: CNPJ_MATRIZ }, itens: [{ sku: "CL-EH-SAC-15-HAL", descricao: "Item", produtoId: 123, quantidade: 3, valor: 12.5 }] };
const nat = { familia_processo: "transferencia", exige_expedicao: false, bling_natureza_id: d.naturezaId };
Deno.test("payload natureza correta", () => assertEquals(payloadTrs(d).naturezaOperacao.id, 15110073811));
Deno.test("payload destinatário matriz", () => assertEquals(payloadTrs(d).contato, { id: 18041940230, numeroDocumento: "63591078000148" }));
Deno.test("payload loja SC", () => assertEquals(payloadTrs(d).loja.id, 206045757));
Deno.test("payload referencia canônica da captura", () => assertEquals(payloadTrs(d).numeroPedidoLoja, "TRS-0020"));
Deno.test("payload itens a custo sem duplicatas", () => { assertEquals(payloadTrs(d).itens[0].valor, 12.5); assertEquals(valorTrs(d), 37.5); assertEquals(payloadTrs(d).parcelas, []); });
Deno.test("recusa transferência física", () => assertStringIncludes(recusaTrs({ ...nat, exige_expedicao: true }, true, null) ?? "", "física"));
Deno.test("recusa sem natureza", () => assertStringIncludes(recusaTrs(null, true, null) ?? "", "natureza"));
Deno.test("recusa sem natureza Bling", () => assertStringIncludes(recusaTrs({ ...nat, bling_natureza_id: null }, true, null) ?? "", "fiscal"));
Deno.test("recusa não habilitada", () => assertStringIncludes(recusaTrs(nat, false, null) ?? "", "habilitada"));
Deno.test("recusa TRS já enviada", () => assertStringIncludes(recusaTrs(nat, true, "27395674379") ?? "", "já enviada"));
Deno.test("aceita fiscal habilitada", () => assertEquals(recusaTrs(nat, true, null), null));
Deno.test("cria só rascunho e confere natureza e total", async () => {
  const chamadas: string[] = [], registros: Registro[] = [];
  const resultado = await gerarTrs(d, false, { bling: { get: async p => { chamadas.push(p); return { data: { numero: "10", naturezaOperacao: { id: d.naturezaId }, valorNota: 37.5 } }; }, post: async (p, _b, opts) => { chamadas.push(p); assertEquals(opts?.retry, false); return { data: { id: 99 } }; } }, registrar: async r => { registros.push(r); }, evento: async e => { assertStringIncludes(e, "próximo passo: transmitir"); } });
  assertEquals(chamadas, ["/nfe", "/nfe/99"]); assertEquals(registros.map(r => r.status), ["gerando", "rascunho"]); assertEquals(resultado.natureza_conferida, true); assertEquals(resultado.alertas, []);
});
Deno.test("retry erro recupera por numeroPedidoLoja sem POST", async () => {
  let posts = 0;
  const result = await gerarTrs(d, true, { bling: { get: async p => p.startsWith("/nfe?") ? { data: [{ id: 99 }] } : { data: { numeroPedidoLoja: "TRS-0020", numero: "10", naturezaOperacao: { id: d.naturezaId }, valorNota: 37.5 } }, post: async () => { posts++; return {}; } }, registrar: async () => {}, evento: async () => {} });
  assertEquals(posts, 0); assertEquals(result.bling_nfe_id, 99);
});
Deno.test("falha leitura preserva id e registra erro", async () => {
  const registros: Registro[] = [];
  await assertRejects(() => gerarTrs(d, false, { bling: { get: async () => { throw new Error("GET falhou"); }, post: async () => ({ data: { id: 99 } }) }, registrar: async r => { registros.push(r); }, evento: async () => {} }), Error, "GET falhou");
  assertEquals(registros.at(-1)?.bling_nfe_id, 99); assertEquals(registros.at(-1)?.status, "erro");
});
Deno.test("divergências retornam alertas sem transmissão", async () => {
  const result = await gerarTrs(d, false, { bling: { get: async () => ({ data: { naturezaOperacao: { id: 1 }, valorNota: 100 } }), post: async () => ({ data: { id: 99 } }) }, registrar: async () => {}, evento: async () => {} });
  assertEquals(result.natureza_conferida, false); assertEquals(result.alertas.length, 2);
});
Deno.test("recuperação ambígua nunca cria", async () => {
  let posts = 0;
  await assertRejects(() => gerarTrs(d, true, { bling: { get: async p => p.startsWith("/nfe?") ? { data: [{ id: 98 }, { id: 99 }] } : { data: { numeroPedidoLoja: d.codigo } }, post: async () => { posts++; return {}; } }, registrar: async () => {}, evento: async () => {} }), Error, "ambígua");
  assertEquals(posts, 0);
});