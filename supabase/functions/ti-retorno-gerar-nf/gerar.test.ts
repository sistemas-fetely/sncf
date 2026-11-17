import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BlingHttpError } from "../_shared/bling/bling-client.ts";
import { buscarNfRetorno, montarPayload, criarOuRecuperar, CNPJ_MATRIZ, desdeSp } from "./gerar.ts";
const dados = { codigo: "TI-0014", remessa: "TI-0013", numero: "000141", chave: "1".repeat(44), naturezaId: 15111598333, contato: { numeroDocumento: CNPJ_MATRIZ }, contagem: [{ sku: "A", recebido: 2 }, { sku: "B", recebido: 0 }], custos: [{ sku: "A", valor_unitario: 4 }], produtos: [{ sku: "A", codigo_externo: "EXT-A", ncm: "12345678", origem_fisc: "0" }] };
const payload = montarPayload(dados);
const criterio = { codigo: dados.codigo, naturezaId: dados.naturezaId, itens: payload.itens, desde: "2026-11-16" };
const nf = { id: 141, numero: "000142", naturezaOperacao: { id: dados.naturezaId }, contato: { numeroDocumento: CNPJ_MATRIZ }, observacoes: `Retorno ${dados.codigo}`, itens: payload.itens };
const nada = async () => {};
Deno.test("payload: NF entrada tipo 0", () => assertEquals(payload.tipo, 0));
Deno.test("payload: referencia a chave da NF de remessa modelo 55", () => assertEquals(payload.documentoReferenciado, { modelo: "55", chaveAcesso: "1".repeat(44) }));
Deno.test("payload: somente recebido > 0 e custo da TI", () => { assertEquals(payload.itens.length, 1); assertEquals(payload.itens[0].quantidade, 2); assertEquals(payload.itens[0].valor, 4); assertEquals(payload.itens[0].codigo, "EXT-A"); });
Deno.test("SP: data civil anterior com margem de 1 dia", () => assertEquals(desdeSp(new Date("2026-11-17T01:00:00Z")), "2026-11-15"));
Deno.test("busca dirigida: achou por observacao e itens", async () => {
  const caminhos: string[] = [];
  const r = await buscarNfRetorno({ get: async (p) => { caminhos.push(p); return { data: p.includes("?") ? [{ id: 141 }] : nf }; } }, criterio, nada);
  assertEquals(r, { achou: { id: 141, numero: "000142" } });
  assertEquals(caminhos[0], "/nfe?tipo=0&dataEmissaoInicial=2026-11-16&limite=100&pagina=1");
});
Deno.test("busca: nenhuma", async () => assertEquals(await buscarNfRetorno({ get: async () => ({ data: [] }) }, criterio, nada), { nenhuma: true }));
Deno.test("busca: duas candidatas ambigua", async () => {
  const r = await buscarNfRetorno({ get: async (p) => ({ data: p.includes("?") ? [{ id: 141 }, { id: 142 }] : nf }) }, criterio, nada);
  assertEquals("ambigua" in r && r.ambigua.length, 2);
});
Deno.test("busca: erro rede incompleta", async () => assertEquals(await buscarNfRetorno({ get: async () => { throw new Error("rede"); } }, criterio, nada), { incompleta: true }));
Deno.test("busca: maximo 40 detalhes, nunca retorna unico de busca incompleta", async () => {
  let detalhes = 0;
  const r = await buscarNfRetorno({ get: async (p) => { if (!p.includes("?")) detalhes++; return { data: p.includes("?") ? Array.from({ length: 41 }, (_, i) => ({ id: i + 1 })) : nf }; } }, criterio, nada);
  assertEquals(r, { incompleta: true }); assertEquals(detalhes, 40);
});
Deno.test("busca: duas paginas cheias incompleta sem pagina 3", async () => {
  let paginas = 0;
  const r = await buscarNfRetorno({ get: async () => { paginas++; return { data: Array.from({ length: 100 }, () => ({ id: 1, naturezaOperacao: { id: 9 } })) }; } }, criterio, nada);
  assertEquals(r, { incompleta: true }); assertEquals(paginas, 2);
});
Deno.test("busca: rejeita contato natureza observacao ou quantidades diferentes", async () => {
  for (const invalida of [{ ...nf, contato: { numeroDocumento: "1" } }, { ...nf, naturezaOperacao: { id: 9 } }, { ...nf, observacoes: "outra TI" }, { ...nf, itens: [{ codigo: "EXT-A", quantidade: 3 }] }]) {
    assertEquals(await buscarNfRetorno({ get: async (p) => ({ data: p.includes("?") ? [{ id: 141 }] : invalida }) }, criterio, nada), { nenhuma: true });
  }
});
Deno.test("POST 504 recupera sem segundo POST", async () => {
  let posts = 0;
  const r = await criarOuRecuperar({ post: async (_p, _b, opts) => { posts++; assertEquals(opts, { retry: false }); throw new BlingHttpError("504", 504); }, get: async (p) => ({ data: p.includes("?") ? [{ id: 141 }] : nf }) }, payload, dados.codigo, false, nada);
  assertEquals(r.recuperado, true); assertEquals(posts, 1);
});
Deno.test("POST 400 nao recupera", async () => {
  let gets = 0;
  await assertRejects(() => criarOuRecuperar({ post: async () => { throw new BlingHttpError("validacao", 400); }, get: async () => { gets++; return { data: [] }; } }, payload, dados.codigo, false, nada), BlingHttpError);
  assertEquals(gets, 0);
});
Deno.test("vinha de erro: adota NF existente sem POST", async () => {
  let posts = 0;
  const r = await criarOuRecuperar({ post: async () => { posts++; }, get: async (p) => ({ data: p.includes("?") ? [{ id: 141 }] : nf }) }, payload, dados.codigo, true, nada);
  assertEquals(r.id, 141); assertEquals(posts, 0);
});
Deno.test("504 sem NF: quatro buscas e erro sem segundo POST", async () => {
  let gets = 0, posts = 0;
  await assertRejects(() => criarOuRecuperar({ post: async () => { posts++; throw new BlingHttpError("504", 504); }, get: async () => { gets++; return { data: [] }; } }, payload, dados.codigo, false, nada), Error, "confira no Bling antes de tentar de novo");
  assertEquals(gets, 4); assertEquals(posts, 1);
});
Deno.test("recuperacao incompleta nunca cria", async () => {
  let posts = 0;
  await assertRejects(() => criarOuRecuperar({ post: async () => { posts++; }, get: async () => { throw new Error("rede"); } }, payload, dados.codigo, true, nada), Error, "Busca incompleta");
  assertEquals(posts, 0);
});