import { describe, expect, test } from "bun:test";
import { BlingHttpError, makeBlingClient } from "../_shared/bling/bling-client.ts";

async function handlerFor(get: (path: string) => Promise<unknown>, channels: Record<string, any>[] = []) {
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace(/^import .*;\n/gm, ""));
  const tables: string[] = [];
  const writes: Record<string, any>[] = [];
  const filters: [string, unknown][] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const sb = {
    from(table: string) {
      tables.push(table);
      if (table === "integracoes_config") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { access_token: "test", token_expires_at: null } }) }) }) };
      if (table === "marketplace_loja_bling") return {
        select: (columns: string) => {
          let id: unknown;
          const query = {
            eq: (field: string, value: unknown) => { filters.push([field, value]); if (field === "loja_bling_id") id = value; return query; },
            maybeSingle: async () => ({ data: channels.find((c) => c.loja_bling_id === id) ?? null }),
            then: (resolve: (value: unknown) => unknown) => resolve({ data: channels.filter((c) => c.ativo && c.marketplace_loja?.ativo) }),
          };
          if (columns.includes("!inner")) expect(columns).toBe("loja_bling_id, marketplace_codigo, descricao, marketplace_loja!inner(codigo, nome, ativo)");
          return query;
        },
        upsert: async ([record]: Record<string, any>[], options: Record<string, unknown>) => {
          expect(options).toEqual({ onConflict: "loja_bling_id", defaultToNull: false });
          writes.push(record);
          const existing = channels.find((c) => c.loja_bling_id === record.loja_bling_id);
          if (existing) Object.assign(existing, record); else channels.push({ ativo: true, ...record });
          return { error: null };
        },
      };
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc() { throw new Error("No RPC allowed"); },
  };
  new Function("createClient", "corsHeaders", "gateCronOuSessao", "BlingHttpError", "ensureFreshToken", "makeBlingClient", "resolverParceiroBling", "Deno", js)(
    () => sb, { "Access-Control-Allow-Headers": "content-type" }, async () => null,
    BlingHttpError, async () => "test", () => ({ get }),
    () => { throw new Error("No partner resolution allowed"); },
    { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } },
  );
  return { handler, tables, writes, filters };
}

const request = (body: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });

describe("marketplace diagnostic actions", () => {
  test("etiqueta returns raw labels and then raw objects without writes", async () => {
    const paths: string[] = [];
    const labels = { data: [{ url: "https://example.com/etiqueta" }], extra: "raw" };
    const objects = { data: [{ codigo: "AB123" }] };
    const { handler, tables, writes } = await handlerFor(async (path) => {
      paths.push(path);
      return paths.length === 1 ? labels : objects;
    });
    const response = await handler(request({ acao: "etiqueta", bling_pedido_id: " 123 " }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: labels, objetos: objects });
    expect(paths).toEqual(["/logisticas/etiquetas?idsVendas%5B%5D=123", "/logisticas/objetos?idsVendas%5B%5D=123"]);
    expect(tables).toEqual(["integracoes_config"]);
    expect(writes).toEqual([]);
  });

  test("object errors do not fail a successful label response", async () => {
    const { handler } = await handlerFor(async (path) => {
      if (path.startsWith("/logisticas/objetos")) throw new Error("Bling 404: objetos indisponíveis");
      return { data: [] };
    });
    const response = await handler(request({ acao: "etiqueta", bling_pedido_id: "123" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { data: [] }, objetos_erro: "Bling 404: objetos indisponíveis" });
  });

  test("label errors return 502 and the complete Bling body while still fetching objects", async () => {
    const corpo = JSON.stringify({ error: { message: "Etiqueta indisponível", details: "x".repeat(700) } });
    const { handler, writes } = await handlerFor(async (path) => {
      if (path.startsWith("/logisticas/etiquetas")) throw new BlingHttpError("Bling 400", 400, corpo);
      return { data: [123] };
    });
    const response = await handler(request({ acao: "etiqueta", bling_pedido_id: "123" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ ok: false, erro: "Bling 400: Etiqueta indisponível", corpo, objetos: { data: [123] } });
    expect(writes).toEqual([]);
  });

  test("etiqueta rejects invalid IDs without calling Bling", async () => {
    let calls = 0;
    const { handler } = await handlerFor(async () => { calls++; return {}; });
    for (const id of [undefined, "", "  ", 123]) {
      expect((await handler(request({ acao: "etiqueta", bling_pedido_id: id }))).status).toBe(400);
    }
    expect(calls).toBe(0);
  });

  test("shared GET preserves the complete error body and existing error message", async () => {
    const originalFetch = globalThis.fetch;
    const corpo = JSON.stringify({ error: { message: "x".repeat(700) } });
    globalThis.fetch = (async () => new Response(corpo, { status: 400 })) as typeof fetch;
    try {
      const client = makeBlingClient({}, { client_id: "test", client_secret: "test", access_token: "test", refresh_token: "test", token_expires_at: null }, "test");
      let error: unknown;
      try { await client.get("/logisticas/etiquetas?idsVendas%5B%5D=123"); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(BlingHttpError);
      if (!(error instanceof BlingHttpError)) throw new Error("Expected BlingHttpError");
      expect(error.corpo).toBe(corpo);
      expect(error.status).toBe(400);
      expect(error.message).toBe(`Bling 400: ${corpo.slice(0, 300)}`);
    } finally { globalThis.fetch = originalFetch; }
  });

  test("lojas reads canais-venda and returns tipo", async () => {
    const paths: string[] = [];
    const { handler, writes } = await handlerFor(async (path) => {
      paths.push(path);
      return { data: [{ id: 123, descricao: "TikTok Shop", tipo: "TikTok" }] };
    });
    const response = await handler(request({ acao: "lojas" }));
    expect(paths).toEqual(["/canais-venda?limite=100&pagina=1"]);
    expect((await response.json()).lojas_bling).toEqual([{ id: 123, descricao: "TikTok Shop", tipo: "TikTok" }]);
    expect(writes).toEqual([{ loja_bling_id: 123, marketplace_codigo: "TTS", descricao: "TikTok Shop", tipo_bling: "TikTok" }]);
  });

  test("lojas maps all six MercadoLivre channels and Shopee by tipo, preserving inactive channels", async () => {
    const channels = [{ loja_bling_id: 1, ativo: false }];
    const { handler, writes, tables } = await handlerFor(async () => ({ data: [
      ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, descricao: `Canal ${i + 1}`, tipo: "MercadoLivre" })),
      { id: 7, descricao: "Canal 7", tipo: "Shopee" },
      { id: 8, descricao: "Mercado Livre por nome", tipo: "Outro" },
    ] }), channels);
    const response = await handler(request({ acao: "lojas" }));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.marketplace[0].origem).toBe("atualizado");
    expect(result.marketplace[1].origem).toBe("inserido");
    expect(writes.filter((w) => w.marketplace_codigo === "MLB")).toHaveLength(6);
    expect(writes[6].marketplace_codigo).toBe("SHP");
    expect(writes.every((w) => !("ativo" in w))).toBe(true);
    expect(channels[0].ativo).toBe(false);
    expect(tables.includes("marketplace_loja")).toBe(false);
  });

  test("pedidos iterates each active channel and filters both activation flags", async () => {
    const paths: string[] = [];
    const channels = Array.from({ length: 6 }, (_, i) => ({ loja_bling_id: i + 1, marketplace_codigo: "MLB", ativo: true, marketplace_loja: { ativo: true } }));
    const { handler, filters } = await handlerFor(async (path) => { paths.push(path); return { data: [] }; }, [
      ...channels, { loja_bling_id: 7, ativo: false, marketplace_loja: { ativo: true } },
      { loja_bling_id: 8, ativo: true, marketplace_loja: { ativo: false } },
    ]);
    expect((await handler(request({ acao: "pedidos" }))).status).toBe(200);
    expect(filters).toEqual([["ativo", true], ["marketplace_loja.ativo", true]]);
    expect(paths.map((p) => new URL(`https://example.com${p}`).searchParams.get("idLoja"))).toEqual(["1", "2", "3", "4", "5", "6"]);
  });

  test("detalhe returns the order without marketplace or queue writes", async () => {
    const paths: string[] = [];
    const det = { id: 123, numero: "456" };
    const { handler, tables } = await handlerFor(async (path) => { paths.push(path); return { data: det }; });
    const response = await handler(request({ acao: "detalhe", bling_pedido_id: "123" }));
    expect(await response.json()).toEqual({ ok: true, data: det });
    expect(paths).toEqual(["/pedidos/vendas/123"]);
    expect(tables).toEqual(["integracoes_config"]);
  });

  test("detalhe refuses a missing ID before contacting Bling", async () => {
    const { handler } = await handlerFor(async () => { throw new Error("Must not contact Bling"); });
    const response = await handler(request({ acao: "detalhe" }));
    expect(response.status).toBe(400);
  });
});