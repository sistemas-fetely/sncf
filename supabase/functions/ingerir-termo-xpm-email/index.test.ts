import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const transpiler = new Bun.Transpiler({ loader: "ts" });
const parserSource = await Bun.file(new URL("./parser.ts", import.meta.url)).text();
const parserJs = transpiler.transformSync(parserSource.replace(/^import .*;\n/gm, "").replace(/export /g, ""));
const { parsearTermoEmail, dataBrasilia } = new Function("DOMParser", `${parserJs}; return { parsearTermoEmail, dataBrasilia };`)(
  class { parseFromString(html: string) { return new JSDOM(html).window.document; } },
);
const html = `<table><tr><td>Outra tabela</td></tr></table><table><tr><th>Recebido</th><th>Descrição</th><th>Documento</th><th>Item</th><th>Declarado</th><th>Lote</th><th>Validade/Série</th><th>Falta</th><th>Excesso</th><th>Não conforme</th><th>RNC</th></tr><tr><td>4,5</td><td>Vela</td><td>178804.0</td><td> LUM001 </td><td>6</td><td>N/A</td><td>N/A</td><td>1,5</td><td></td><td>0</td><td>N/A</td></tr><tr><td></td><td></td><td></td><td>123</td><td>99</td></tr></table>`;

test("HTML maps reordered accented columns, quantities, NF and N/A, preserving numeric ITEM", () => {
  expect(parsearTermoEmail(html)).toEqual([{ nf: "178804", sku: "LUM001", descricao: "Vela", lote: "", validade: "",
    declarado: 6, recebido: 4.5, falta: 1.5, excesso: 0, nao_conforme: 0, rnc: "" },
    { nf: "", sku: "123", descricao: "", lote: "", validade: "", declarado: 99, recebido: 0, falta: 0, excesso: 0, nao_conforme: 0, rnc: "" }]);
});
test("numeric and alphanumeric ITEM stay raw; only header and doubly empty rows are skipped", () => {
  const rows = parsearTermoEmail(`<table><tr><th>DOCUMENTO</th><th>ITEM</th><th>DECLARADO</th></tr>
    <tr><td>178804.0</td><td> 1588 </td><td>1</td></tr>
    <tr><td>178804</td><td> ab-1711 </td><td>2</td></tr>
    <tr><td>DOCUMENTO</td><td> item </td><td>DECLARADO</td></tr>
    <tr><td> </td><td> </td><td>999</td></tr>
    <tr><td>178805</td><td> </td><td>3</td></tr></table>`);
  expect(rows.map(({ nf, sku }) => ({ nf, sku }))).toEqual([
    { nf: "178804", sku: "1588" }, { nf: "178804", sku: "ab-1711" }, { nf: "178805", sku: "" },
  ]);
});
test("missing table and zero rows fail loudly", () => {
  expect(() => parsearTermoEmail("<table><tr><td>Outro</td></tr></table>")).toThrow("Nenhuma tabela");
  expect(() => parsearTermoEmail("<table><tr><th>DOCUMENTO</th><th>ITEM</th><th>DECLARADO</th></tr></table>")).toThrow("0 linhas");
});
test("receipt date uses Brasília, not UTC", () => {
  expect(dataBrasilia("2026-11-11T01:30:00Z")).toBe("2026-11-10");
});

async function executar({ duplicate = false, inputHtml = html, rpcError = null as string | null, internal = "internal", subject = "NF 178804/178805" } = {}) {
  const logs: Record<string, unknown>[] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const sb = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "get_vault_secret") return { data: args.p_name === "INTERNAL_EDGE_KEY" ? internal : "resend-test" };
      return { data: rpcError ? null : { termo_entrada_id: "termo-1" }, error: rpcError ? { message: rpcError } : null };
    },
    from() { return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: duplicate ? { id: "1", erro: null } : null }) }) }),
      upsert: async (log: Record<string, unknown>) => { logs.push(log); return { error: null }; },
    }; },
  };
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  new Function("createClient", "corsHeaders", "dataBrasilia", "parsearTermoEmail", "Deno", "fetch", "console",
    transpiler.transformSync(source.replace(/^import .*;\n/gm, "")))(
    () => sb, { "Access-Control-Allow-Headers": "content-type" }, dataBrasilia, parsearTermoEmail,
    { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } },
    async () => Response.json({ from: "xpm@example.com", subject, created_at: "2026-11-11T01:30:00Z", html: inputHtml }),
    { log: () => {} },
  );
  const response = await handler(new Request("http://localhost", { method: "POST", headers: { "x-internal-key": internal || "resend-test" }, body: JSON.stringify({ resend_email_id: "email-1" }) }));
  return { response, logs, calls };
}
test("authenticated ingestion sends required RPC arguments and persists result", async () => {
  const { response, logs, calls } = await executar();
  expect(response.status).toBe(200);
  expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args).toEqual({ p_termo: "NF 178804/178805",
    p_rows: parsearTermoEmail(html), p_data_recebimento: "2026-11-10", p_centro_codigo: "XPM-SC", p_porta: "xpm" });
  expect(logs[0].termo_entrada_id).toBe("termo-1");
  expect(logs[0].erro).toBeNull();
});
test("successful email is not ingested twice", async () => {
  const { response, logs, calls } = await executar({ duplicate: true });
  expect(await response.json()).toEqual({ duplicado: true });
  expect(logs).toHaveLength(0);
  expect(calls.some((c) => c.name === "ingerir_termo_conferencia")).toBe(false);
});
test("repeated forwarding/reply prefixes are removed only from p_termo, preserving original log subject", async () => {
  for (const subject of ["ENC: FW: NF 178804/178805", " enc : fwd: RES : re: Tr : NF 178804/178805", "NF 178804/178805"]) {
    const { response, logs, calls } = await executar({ subject });
    expect(response.status).toBe(200);
    expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_termo).toBe("NF 178804/178805");
    expect(logs[0].assunto).toBe(subject);
  }
});
test("prefix-like text inside the subject is not removed", async () => {
  const subject = "NF 178804 RE: observação";
  const { calls, logs } = await executar({ subject });
  expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_termo).toBe(subject);
  expect(logs[0].assunto).toBe(subject);
});
test("parser and RPC failures persist the real error and return 500", async () => {
  for (const config of [{ inputHtml: "<p>Sem tabela</p>" }, { rpcError: "Termo já ingerido" }]) {
    const { response, logs } = await executar(config);
    expect(response.status).toBe(500);
    expect(logs).toHaveLength(1);
    expect(logs[0].erro).toContain(config.rpcError ?? "Nenhuma tabela");
  }
});
test("internal key falls back to the Vault Resend key", async () => {
  expect((await executar({ internal: "" })).response.status).toBe(200);
});