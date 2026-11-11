import { expect, test } from "bun:test";
import { z } from "zod";

async function handlerQz(role: string | null, existing = false) {
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  const js = new Bun.Transpiler({ loader: "ts" }).transformSync(source.replace(/^import .*;\n/gm, ""));
  let handler = async (_req: Request) => new Response();
  const writes: string[] = [];
  const ctx = {
    userId: "test-user",
    servidor: { from: () => ({ select: () => ({ eq: async () => ({ data: [{ role }], error: null }) }) }) },
    usuario: { rpc: async (name: string, args: Record<string, string>) => {
      if (name === "usuario_tem_acao") return { data: true, error: null };
      writes.push(args.p_nome); return { data: { ok: true }, error: null };
    } },
  };
  new Function("z", "gerarParQz", "contextoQz", "corsHeaders", "lerSegredo", "resposta", "Deno", js)(
    z, async () => ({ chave: "mock-private", certificado: "mock-public" }), async () => role ? ctx : null,
    {}, async () => existing ? "mock-public" : null, (body: unknown, status = 200) => Response.json(body, { status }),
    { serve: (fn: typeof handler) => { handler = fn; } },
  );
  return { handler, writes };
}
const request = (body: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(body) });
test("QZ certificate generation denies unauthenticated and non-admin callers", async () => {
  for (const [role, status] of [[null, 401], ["operacional", 403]] as const) {
    const { handler, writes } = await handlerQz(role);
    expect((await handler(request({ acao: "gerar" }))).status).toBe(status); expect(writes).toEqual([]);
  }
});
test("QZ existing key/certificate refuses generation unless forced", async () => {
  const { handler, writes } = await handlerQz("super_admin", true);
  expect((await handler(request({ acao: "gerar" }))).status).toBe(409); expect(writes).toEqual([]);
  const response = await handler(request({ acao: "gerar", forcar: true }));
  expect(await response.json()).toEqual({ certificado: "mock-public" });
  expect(writes).toEqual(["qz_private_key", "qz_certificado"]);
});
test("QZ authenticated user can retrieve only public certificate", async () => {
  const { handler, writes } = await handlerQz("operacional", true);
  expect(await (await handler(request({ acao: "certificado" }))).json()).toEqual({ certificado: "mock-public" });
  expect(writes).toEqual([]);
});