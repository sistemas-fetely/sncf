import { assertEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { BlingHttpError } from "../_shared/bling/bling-client.ts";
import { conferirPedidoCancelado, reenviarVerificado, validarMotivoReenvio, ERRO_NF_REENVIO } from "../_shared/bling/reenvio-verificado.ts";

function client(situacao = 12, nf = 0) {
  return { get: async (path: string) => {
    if (path.startsWith("/pedidos/")) return { data: { situacao: { id: situacao }, notaFiscal: { id: nf } } };
    if (path === "/situacoes/modulos") return { data: [{ id: 7, nome: "Vendas" }] };
    return { data: [{ id: 12, nome: "Cancelado" }, { id: 6, nome: "Em aberto" }] };
  } };
}

Deno.test("motivo exige 10 caracteres, desconsiderando espaços", async () => {
  assertEquals(validarMotivoReenvio("  1234567890  "), "1234567890");
  await assertRejects(async () => validarMotivoReenvio(" 123456789 "), Error, "mínimo 10");
});
Deno.test("Cancelado é descoberto na API, não fixado", async () => {
  const c = { get: async (p: string) => p.startsWith("/pedidos/") ? { data: { situacao: { id: 987 } } } : p === "/situacoes/modulos" ? { data: [{ nome: "Vendas", id: 42 }] } : { data: [{ id: 987, nome: "Cancelado" }] } };
  assertEquals(await conferirPedidoCancelado(c, "27443803842"), "Cancelado");
});
Deno.test("somente 404 HTTP libera como excluído", async () => {
  assertEquals(await conferirPedidoCancelado({ get: () => Promise.reject(new BlingHttpError("ausente", 404)) }, "1"), "Excluído (404)");
});
for (const status of [401, 429, 500]) Deno.test(`erro HTTP ${status} nunca libera`, async () => {
  await assertRejects(() => conferirPedidoCancelado({ get: () => Promise.reject(new BlingHttpError("falha", status)) }, "1"), BlingHttpError);
});
Deno.test("rede falha fechada, mesmo com texto 404", async () => {
  await assertRejects(() => conferirPedidoCancelado({ get: () => Promise.reject(new Error("rede 404")) }, "1"), Error, "rede 404");
});
Deno.test("ativo recusa com situação e orientação", async () => {
  await assertRejects(() => conferirPedidoCancelado(client(6), "1"), Error, "Pedido ainda ativo no Bling (situação Em aberto). Cancele lá primeiro.");
});
Deno.test("situação ausente recusa", async () => {
  await assertRejects(() => conferirPedidoCancelado(client(0), "1"), Error, "não informada");
});
Deno.test("NF no Bling recusa antes da preparação", async () => {
  await assertRejects(() => conferirPedidoCancelado(client(12, 123), "1"), Error, ERRO_NF_REENVIO);
});

function dbFake(nf = false) {
  const writes: { table: string; value: any }[] = [];
  let preparacoes = 0;
  const db = {
    from: (table: string) => {
      let update = false;
      const q: any = { select: () => q, eq: () => q, or: () => q, not: () => q, is: () => q,
        limit: async () => ({ data: nf ? [{ id: "nf" }] : [], error: null }),
        single: async () => ({ data: { bling_id_destino: 27443803842 }, error: null }),
        update: (value: any) => { writes.push({ table, value }); update = true; return q; },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null, data: update ? null : [] }).then(resolve),
      };
      return q;
    },
    rpc: async () => { preparacoes++; return { data: { evento_id: "evento" }, error: null }; },
  };
  return { db, writes, preparacoes: () => preparacoes };
}
const base = { client: client(), pedidoId: "fabac877-fc4b-4d19-9e1a-f5fd446c0e31", usuario: "user", motivo: "Preço corrigido" };
Deno.test("NF local impede preparação e envio", async () => {
  const f = dbFake(true); let envios = 0;
  await assertRejects(() => reenviarVerificado({ ...base, db: f.db, enviar: async () => { envios++; return new Response(); } }), Error, ERRO_NF_REENVIO);
  assertEquals(f.preparacoes(), 0); assertEquals(envios, 0);
});
Deno.test("sucesso usa um envio normal e registra antigo → novo", async () => {
  const f = dbFake(); let envios = 0;
  const response = await reenviarVerificado({ ...base, db: f.db, enviar: async () => { envios++; return Response.json({ sucesso: true, bling_id: 999 }); } });
  assertEquals(response.status, 200); assertEquals(envios, 1); assertEquals(f.preparacoes(), 1);
  assertEquals(f.writes[0].value.metadata.bling_id_anterior, "27443803842");
  assertEquals(f.writes[0].value.metadata.bling_id_novo, "999");
});
Deno.test("falha posterior grava erro sem restaurar id cancelado", async () => {
  const f = dbFake();
  await reenviarVerificado({ ...base, db: f.db, enviar: async () => Response.json({ sucesso: false, erro: "Preço inválido" }, { status: 409 }) });
  assertEquals(f.writes[0], { table: "pedidos", value: { bling_envio_erro: "Preço inválido" } });
  assertEquals(f.writes[1].value.metadata.bling_id_novo, null);
});
Deno.test("ativo não prepara nem envia", async () => {
  const f = dbFake(); let envios = 0;
  await assertRejects(() => reenviarVerificado({ ...base, client: client(6), db: f.db, enviar: async () => { envios++; return new Response(); } }), Error, "Cancele lá primeiro");
  assertEquals(f.preparacoes(), 0); assertEquals(envios, 0);
});