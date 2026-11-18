import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { registrarTrilhaSafra, substituirTrilhaSafra, dataTrilhaSafra } from "../_shared/safrapay-trilha.ts";
import { ehCodigoPix, ehLinkPix } from "../_shared/pix-cobranca.ts";

function mock(data: unknown = null, error: unknown = null) {
  const filtros: unknown[] = [];
  const rpcs: unknown[] = [];
  const updates: unknown[] = [];
  const q = {
    select: () => q, eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; },
    update: (v: unknown) => { updates.push(v); return q; },
    maybeSingle: () => Promise.resolve({ data, error }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error }).then(resolve),
  };
  return { filtros, rpcs, updates, sb: { from: () => q,
    rpc: (name: string, args: unknown) => { rpcs.push([name, args]); return Promise.resolve({ error }); } } };
}
const pedido = { id: "pedido", origem: "fop" };
const link = { url: "https://pagamento.example/pix", criado_em: "2026-11-18T01:00:00Z", expira_em: "2026-12-18T01:00:00Z" };
Deno.test("PIX B2B registra tipo pix e datas de São Paulo", async () => {
  const m = mock(); await registrarTrilhaSafra(m.sb, pedido, link, true);
  assertEquals(m.rpcs, [["registrar_link_pagamento", { p_pedido_id: "pedido", p_link: link.url,
    p_gerado_em: "2026-11-17", p_expira_em: "2026-12-17", p_tipo_pagamento: "pix", p_motivo: null }]]);
});
Deno.test("Cartão continua na trilha", async () => {
  const m = mock(); await registrarTrilhaSafra(m.sb, pedido, link, false);
  assertEquals((m.rpcs[0] as [string, { p_tipo_pagamento: string }])[1].p_tipo_pagamento, "cartao");
});
Deno.test("VD PIX e cartão continuam fora", async () => {
  const m = mock(); for (const pix of [true, false]) await registrarTrilhaSafra(m.sb, { ...pedido, origem: "venda_direta" }, link, pix);
  assertEquals(m.rpcs.length, 0); assertEquals(m.filtros.length, 0);
});
Deno.test("Reaproveitamento não duplica a trilha", async () => {
  const m = mock({ id: "existente" }); await registrarTrilhaSafra(m.sb, pedido, link, true);
  assertEquals(m.rpcs.length, 0);
});
Deno.test("Erro de leitura da trilha é literal", async () => {
  const m = mock(null, { message: "banco indisponível" });
  await assertRejects(() => registrarTrilhaSafra(m.sb, pedido, link, true), Error, "banco indisponível");
});
Deno.test("Cancelamento/substituição só fecha a URL correspondente", async () => {
  const m = mock(); await substituirTrilhaSafra(m.sb, { pedido_id: "pedido", url: link.url });
  assertEquals(m.filtros, [["pedido_id", "pedido"], ["link", link.url], ["status", "ativo"]]);
  assertEquals((m.updates[0] as { status: string }).status, "substituido");
});
Deno.test("Link de título não toca a trilha do portão", async () => {
  const m = mock(); await substituirTrilhaSafra(m.sb, { pedido_id: "pedido", url: link.url, titulo_id: "titulo" });
  assertEquals(m.updates.length, 0);
});
Deno.test("Falha ao encerrar trilha não é ocultada", async () => {
  const m = mock(null, { message: "falha de escrita" });
  await assertRejects(() => substituirTrilhaSafra(m.sb, { pedido_id: "pedido", url: link.url }), Error, "falha de escrita");
});
Deno.test("Meia-noite UTC preserva data anterior BRT", () => assertEquals(dataTrilhaSafra("2026-11-18T00:34:00Z"), "2026-11-17"));
Deno.test("Cobrança PIX URL é pagável e não é código bancário", () => {
  assertEquals(ehLinkPix("pix", link.url), true); assertEquals(ehCodigoPix(link.url), false);
  assertEquals(ehLinkPix("cartao", link.url), false);
});
Deno.test("PIX local permanece código copia e cola", () => {
  assertEquals(ehCodigoPix("000201123456"), true); assertEquals(ehLinkPix("pix", "000201123456"), false);
});
Deno.test("Cancelamento encontra a URL normalizada pela RPC", async () => {
  const m = mock();
  await substituirTrilhaSafra(m.sb, { pedido_id: "pedido", url: link.url + "?signinToken=temporario" });
  assertEquals(m.filtros, [["pedido_id", "pedido"], ["link", link.url], ["status", "ativo"]]);
});