import { expect, test } from "bun:test";
import { z } from "zod";

async function handlerQz(authenticated = true) {
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace(/^import .*;\n/gm, ""));
  let handler = async (_req: Request) => new Response();
  let signatures = 0;
  new Function("z", "assinarQz", "contextoQz", "corsHeaders", "lerSegredo", "resposta", "Deno", js)(
    z, async () => { signatures++; return "mock-signature"; }, async () => authenticated ? { servidor: {} } : null,
    {}, async () => "mock-server-only-key", (body: unknown, status = 200) => Response.json(body, { status }),
    { serve: (fn: typeof handler) => { handler = fn; } },
  );
  return { handler, signatures: () => signatures };
}
const request = (toSign: string) => new Request("http://localhost", { method: "POST", body: JSON.stringify({ toSign }) });
test("QZ signature requires authentication before reading the key", async () => {
  const { handler, signatures } = await handlerQz(false);
  expect((await handler(request("print"))).status).toBe(401); expect(signatures()).toBe(0);
});
test("QZ signature accepts 10 KB and refuses larger UTF-8 messages", async () => {
  const { handler, signatures } = await handlerQz();
  expect((await handler(request("a".repeat(10240)))).status).toBe(200);
  expect((await handler(request("a".repeat(10241)))).status).toBe(400);
  expect((await handler(request("é".repeat(5121)))).status).toBe(400);
  expect(signatures()).toBe(1);
});