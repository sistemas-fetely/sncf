import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

const transpiler = new Bun.Transpiler({ loader: "ts" });
const parserSource = await Bun.file(new URL("./parser.ts", import.meta.url)).text();
const parserJs = transpiler.transformSync(parserSource.replace(/^import .*;\n/gm, "").replace(/export /g, ""));
const { parsearTermoEmail, dataBrasilia, dataOriginalEncaminhado } = new Function("DOMParser", `${parserJs}; return { parsearTermoEmail, dataBrasilia, dataOriginalEncaminhado };`)(
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

const marcador = "---------- Forwarded message ---------";
test.each([
  "Enviado: segunda-feira, 10 de novembro de 2026 17:32",
  "Enviada em: 10 de novembro de 2026 17:32",
  "Data: segunda-feira, 10 de novembro de 2026 17:32",
  "ENVIADO: SEGUNDA-FEIRA, 10 DE NOVEMBRO DE 2026 17:32",
  "Sent: Monday, November 10, 2026 5:32 PM",
  "Date: Mon, 10 Nov 2026 at 17:32",
  "Data: 10/11/2026 17:32",
  "Enviada em: 10 de nov. de 2026 às 17:32",
  "Enviado: 10 de nov de 2026 as 17:32",
  "Em seg., 10 de nov. de 2026 às 17:32 escreveu:",
  "Em seg., 10 de novembro de 2026 as 17:32 escreveu:",
])("original header parses in Brasília: %s", (cabecalho) => {
  expect(dataOriginalEncaminhado(`<p>${marcador}</p><p>${cabecalho}</p>`)?.toISOString()).toBe("2026-11-10T20:32:00.000Z");
});

test.each([
  ["jan.", "Jan", 1], ["fev.", "Feb", 2], ["mar.", "Mar", 3], ["abr.", "Apr", 4],
  ["mai.", "May", 5], ["jun.", "Jun", 6], ["jul.", "Jul", 7], ["ago.", "Aug", 8],
  ["set.", "Sep", 9], ["out.", "Oct", 10], ["nov.", "Nov", 11], ["dez.", "Dec", 12],
])("abbreviated Portuguese/English month %s/%s", (pt, en, mes) => {
  const esperado = `2026-${String(mes).padStart(2, "0")}-10T20:32:00.000Z`;
  expect(dataOriginalEncaminhado("", `${marcador}\nEnviado: 10 de ${pt} de 2026 17:32`)?.toISOString()).toBe(esperado);
  expect(dataOriginalEncaminhado("", `${marcador}\nSent: Monday, ${en} 10, 2026 5:32 PM`)?.toISOString()).toBe(esperado);
});

test("Outlook HTML boundary and plain original headers work without visible forwarding divider", () => {
  expect(dataOriginalEncaminhado(`<div id="divRplyFwdMsg"><b>De:</b> XPM<br><b>Enviado:</b> segunda-feira, 10 de novembro de 2026 17:32</div>`)?.toISOString())
    .toBe("2026-11-10T20:32:00.000Z");
  expect(dataOriginalEncaminhado("", "De: XPM\nEnviada em: 10/11/2026 17:32\nAssunto: Termo")?.toISOString())
    .toBe("2026-11-10T20:32:00.000Z");
});

test("Gmail quoted HTML and inline Em header work without visible forwarding divider", () => {
  expect(dataOriginalEncaminhado(`<div class="gmail_quote"><div>Date: Mon, 10 Nov 2026 at 17:32</div></div>`)?.toISOString())
    .toBe("2026-11-10T20:32:00.000Z");
  expect(dataOriginalEncaminhado("", "Em seg., 10 de nov. de 2026 às 17:32 escreveu:")?.toISOString())
    .toBe("2026-11-10T20:32:00.000Z");
});

test("first date after forwarding marker wins, not cover note or nested email", () => {
  const text = `Data: 12/11/2026 09:00\n${marcador}\nDate: Mon, 10 Nov 2026 at 17:32\n${marcador}\nData: 09/11/2026 12:00`;
  expect(dataOriginalEncaminhado("", text)?.toISOString()).toBe("2026-11-10T20:32:00.000Z");
});

test("plain text fallback, midnight/noon AM/PM and Brasília day rollover", () => {
  expect(dataOriginalEncaminhado("<p>Sem cabeçalho legível</p>", `${marcador}\nSent: November 10, 2026 12:32 AM`)?.toISOString())
    .toBe("2026-11-10T03:32:00.000Z");
  expect(dataOriginalEncaminhado("", `${marcador}\nSent: November 10, 2026 12:32 PM`)?.toISOString())
    .toBe("2026-11-10T15:32:00.000Z");
  expect(dataOriginalEncaminhado("", `${marcador}\nData: 10/11/2026 23:32`)?.toISOString())
    .toBe("2026-11-11T02:32:00.000Z");
});

test.each(["Data: 31/11/2026 17:32", "Data: 10/11/2026 25:32", "Data: 10/11/2026 17:99", "Sent: November 10, 2026 13:32 PM", "Data: indisponível"]) (
  "invalid original date returns null: %s", (cabecalho) => {
    expect(dataOriginalEncaminhado("", `${marcador}\n${cabecalho}`)).toBeNull();
  },
);
test("no forwarding content or date returns null", () => {
  expect(dataOriginalEncaminhado("<p>Data: 10/11/2026 17:32</p>")).toBeNull();
  expect(dataOriginalEncaminhado(`<p>${marcador}</p><p>Sem data</p>`)).toBeNull();
});

async function executar({ duplicate = false, inputHtml = html, inputText = "", createdAt = "2026-11-11T01:30:00Z",
  rpcError = null as string | null, rpcResultError = null as string | null, internal = "internal", subject = "NF 178804/178805" } = {}) {
  const logs: Record<string, unknown>[] = [];
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let handler: (req: Request) => Promise<Response> = async () => new Response();
  const sb = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "get_vault_secret") return { data: args.p_name === "INTERNAL_EDGE_KEY" ? internal : "resend-test" };
      return { data: rpcError ? null : rpcResultError ? { ok: false, erro: rpcResultError } : { termo_entrada_id: "termo-1" }, error: rpcError ? { message: rpcError } : null };
    },
    from() { return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: duplicate ? { id: "1", erro: null } : null }) }) }),
      upsert: async (log: Record<string, unknown>) => { logs.push(log); return { error: null }; },
    }; },
  };
  const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
  new Function("createClient", "corsHeaders", "dataBrasilia", "dataOriginalEncaminhado", "parsearTermoEmail", "Deno", "fetch", "console",
    transpiler.transformSync(source.replace(/^import .*;\n/gm, "")))(
    () => sb, { "Access-Control-Allow-Headers": "content-type" }, dataBrasilia, dataOriginalEncaminhado, parsearTermoEmail,
    { env: { get: () => "test" }, serve: (fn: typeof handler) => { handler = fn; } },
    async () => Response.json({ from: "xpm@example.com", subject, created_at: createdAt, html: inputHtml, text: inputText }),
    { log: () => {} },
  );
  const response = await handler(new Request("http://localhost", { method: "POST", headers: { "x-internal-key": internal || "resend-test" }, body: JSON.stringify({ resend_email_id: "email-1" }) }));
  const payload = await response.json();
  return { response, payload, logs, calls };
}
test("authenticated ingestion sends required RPC arguments and persists result", async () => {
  const { response, logs, calls } = await executar();
  expect(response.status).toBe(200);
  expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args).toEqual({ p_termo: "NF 178804/178805",
    p_rows: parsearTermoEmail(html), p_data_recebimento: "2026-11-10", p_centro_codigo: "XPM-SC", p_porta: "xpm_email" });
  expect(logs[0].termo_entrada_id).toBe("termo-1");
  expect(logs[0].erro).toBeNull();
  expect(logs[0].data_origem).toBe("email");
  expect(logs[0].linhas).toEqual(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_rows);
});
test("successful email is not ingested twice", async () => {
  const { payload, logs, calls } = await executar({ duplicate: true });
  expect(payload).toEqual({ duplicado: true });
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

test.each(["ENC:", "FW:", "RES:", "fwd:", " re :", "TR:"])("forwarded subject %s selects original date and logs rows", async (prefix) => {
  const { response, calls, logs } = await executar({ subject: `${prefix} NF 178804/178805`,
    inputHtml: `<p>-----Mensagem original-----</p><div>Enviada em: 04/11/2026 23:32</div>${html}` });
  expect(response.status).toBe(200);
  const args = calls.find((c) => c.name === "ingerir_termo_conferencia")?.args;
  expect(args?.p_data_recebimento).toBe("2026-11-04");
  expect(logs[0].data_origem).toBe("encaminhado");
  expect(logs[0].data_email).toBe("2026-11-11T01:30:00.000Z");
  expect(logs[0].linhas).toEqual(args?.p_rows);
});

test("forwarded email uses original header from text fallback", async () => {
  const { calls, logs } = await executar({ subject: "ENC: NF 178804/178805", inputText: `${marcador}\nDate: Mon, 04 Nov 2026 at 17:32` });
  expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_data_recebimento).toBe("2026-11-04");
  expect(logs[0].data_origem).toBe("encaminhado");
});

test("unforwarded subject ignores quoted dates; missing/invalid original uses email date", async () => {
  for (const config of [
    { subject: "NF 178804/178805", inputText: `${marcador}\nData: 04/11/2026 17:32` },
    { subject: "ENC: NF 178804/178805" },
    { subject: "ENC: NF 178804/178805", inputText: `${marcador}\nData: 31/11/2026 17:32` },
    { subject: "ENC: NF 178804/178805", inputText: `${marcador}\nData: 10/11/2099 17:32` },
  ]) {
    const { calls, logs } = await executar(config);
    expect(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_data_recebimento).toBe("2026-11-10");
    expect(logs[0].data_origem).toBe("email");
  }
});

test("future email date without valid original fails loudly before ingestion", async () => {
  const { response, logs, calls } = await executar({ createdAt: "2099-11-11T01:30:00Z" });
  expect(response.status).toBe(500);
  expect(logs[0].erro).toBe("Data de recebimento futura não permitida.");
  expect(calls.some((c) => c.name === "ingerir_termo_conferencia")).toBe(false);
});

test.each(["Termo já recebido por inteiro...", "Termo de CORREÇÃO..."])("Portuguese RPC refusal stays in log.erro and retains parsed rows: %s", async (erro) => {
  for (const config of [{ rpcError: erro }, { rpcResultError: erro }]) {
    const { response, payload, logs, calls } = await executar({ ...config, subject: "ENC: NF 178804/178805",
      inputText: `${marcador}\nData: 04/11/2026 17:32` });
    expect(response.status).toBe(500);
    expect(payload.ok).toBe(false);
    expect(logs[0].erro).toBe(`ingerir_termo_conferencia: ${erro}`);
    expect(logs[0].data_origem).toBe("encaminhado");
    expect(logs[0].linhas).toEqual(calls.find((c) => c.name === "ingerir_termo_conferencia")?.args.p_rows);
  }
});