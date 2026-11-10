import { describe, expect, test } from "bun:test";

async function handlerFor(get: (path: string) => Promise<unknown>) {
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace(/^import .*;\n/gm, ""));
  const tables: string[] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const sb = {
    from(table: string) {
      tables.push(table);
      if (table === "integracoes_config") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { access_token: "test", token_expires_at: null } }) }) }) };
      if (table === "marketplace_loja") return { select: async () => ({ data: [] }) };
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc() { throw new Error("No RPC allowed"); },
  };
  new Function("createClient", "corsHeaders", "gateCronOuSessao", "BlingHttpError", "ensureFreshToken", "makeBlingClient", "resolverParceiroBling", "Deno", js)(
    () => sb, { "Access-Control-Allow-Headers": "content-type" }, async () => null,
    class extends Error {}, async () => "test", () => ({ get }),
    () => { throw new Error("No partner resolution allowed"); },
    { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } },
  );
  return { handler, tables };
}

const request = (body: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });

describe("marketplace diagnostic actions", () => {
  test("lojas reads canais-venda and returns tipo", async () => {
    const paths: string[] = [];
    const { handler } = await handlerFor(async (path) => {
      paths.push(path);
      return { data: [{ id: 123, descricao: "TikTok Shop", tipo: "marketplace" }] };
    });
    const response = await handler(request({ acao: "lojas" }));
    expect(paths).toEqual(["/canais-venda?limite=100&pagina=1"]);
    expect((await response.json()).lojas_bling).toEqual([{ id: 123, descricao: "TikTok Shop", tipo: "marketplace" }]);
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