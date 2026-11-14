import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { BASE_HML, clienteHml, entrada, erroApi, FalhaSafra, payloadHml, redigir, vencimentoHml } from "./helpers.ts";

Deno.test("F0 recusa produção", () => {
  assertThrows(() => entrada({ acao: "smoke", ambiente: "prod" }), Error, "produção ainda não habilitada");
  assertEquals(entrada({ acao: "smoke", ambiente: "hml" }).acao, "smoke");
});
Deno.test("nosso número informado e numeroCliente de até 10 caracteres", () => {
  assertEquals(entrada({ acao: "registrar", ambiente: "hml", nosso_numero: "915567419", numeroCliente: "HML-123456" }).nosso_numero, "915567419");
  assertThrows(() => entrada({ acao: "registrar", ambiente: "hml", nosso_numero: "1234567890" }));
});
Deno.test("boleto fictício de R$1 com espécie 01 e moeda 0", () => {
  const p = payloadHml({ agencia_4d: "0005", conta_7d: "5804446" }, { logradouro: "MARQ DE SAO VICENTE", numero: "576", bairro: "VARZEA DA BARRA FUNDA", cidade: "SAO PAULO TESTE LONGO", uf: "SP", cep: "01139000" }, "915567419", "HML-123456", "2026-12-14");
  assertEquals(p.agencia, "0005"); assertEquals(p.conta, "5804446");
  assertEquals(p.documento.numero, "915567419"); assertEquals(p.documento.valor, 1);
  assertEquals(p.documento.especie, "01"); assertEquals(p.documento.codigoMoeda, 0);
  assertEquals(p.documento.pagador.tipoPessoa, "J"); assertEquals(p.documento.pagador.numeroDocumento, "63591078000148");
  assertEquals(p.documento.pagador.endereco.bairro, "VARZEA DA ");
  assertEquals(p.documento.pagador.endereco.cidade, "SAO PAULO TESTE");
});
Deno.test("vencimento hoje mais 30 dias", () => assertEquals(vencimentoHml(new Date("2026-11-14T09:32:00Z")), "2026-12-14"));
Deno.test("redação recursiva de credenciais e ecos", () => {
  assertEquals(redigir({ password: "fixture", nested: [{ access_token: "fixture", refresh_token: "fixture", Authorization: "fixture", texto: "eco fixture" }] }, ["fixture"]), { password: "[REDACTED]", nested: [{ access_token: "[REDACTED]", refresh_token: "[REDACTED]", Authorization: "[REDACTED]", texto: "eco [REDACTED]" }] });
});
Deno.test("fields e business-validation preservam mensagem de negócio", () => {
  assertEquals(erroApi({ "business-validation": [{ message: "NOSSO NUMERO JA EXISTENTE EM NOSSA BASE" }] }, 422), { codigo: "business-validation", mensagem: "NOSSO NUMERO JA EXISTENTE EM NOSSA BASE" });
  assertEquals(erroApi({ code: "BAD_REQUEST", fields: [{ field: "documento.numero", message: "obrigatório" }] }, 400).mensagem, "obrigatório");
});
Deno.test("cada chamada exclusivamente HML tem UUID único e log sem bearer", async () => {
  const calls: { url: string; headers: Headers }[] = [];
  const logs: unknown[] = [];
  const cliente = clienteHml({ segredos: ["fixture"], fetch: (async (input, init) => { calls.push({ url: String(input), headers: new Headers(init?.headers) }); return new Response('{"numero":"915567419"}', { status: 201 }); }) as typeof fetch, iniciar: async (log) => { logs.push(log); return crypto.randomUUID(); }, finalizar: async (_id, log) => { logs.push(log); } });
  await cliente("/gateway/cobrancas/v1/boletos", "POST", {}, "fixture");
  await cliente("/gateway/cobrancas/v1/boletos?numero=915567419", "GET", null, "fixture");
  assertEquals(calls.every((c) => c.url.startsWith(BASE_HML + "/gateway/")), true);
  assertEquals(calls.every((c) => /^[0-9a-f-]{36}$/.test(c.headers.get("Safra-Correlation-ID") ?? "")), true);
  assertEquals(calls[0].headers.get("Safra-Correlation-ID") === calls[1].headers.get("Safra-Correlation-ID"), false);
  assertEquals(JSON.stringify(logs).includes("fixture"), false);
});
Deno.test("token enviado em form e resposta sempre redigida", async () => {
  const logs: unknown[] = [];
  const cliente = clienteHml({ segredos: ["fixture-password"], fetch: (async (_input, init) => {
    assertEquals(new Headers(init?.headers).get("Content-Type"), "application/x-www-form-urlencoded");
    assertEquals(String(init?.body), "grant_type=password&password=fixture-password");
    return new Response('{"access_token":"fixture-access","refresh_token":"fixture-refresh"}');
  }) as typeof fetch, iniciar: async (log) => { logs.push(log); return "id"; }, finalizar: async (_id, log) => { logs.push(log); } });
  await cliente("/gateway/v1/oauth2/token", "POST", { grant_type: "password", password: "fixture-password" }, undefined, true);
  assertEquals(JSON.stringify(logs).includes("fixture-"), false);
});
for (const status of [400, 401, 422, 500, 503]) {
  Deno.test(`HTTP ${status} falha explícita e registrada sem retry`, async () => {
    let quantidade = 0; let gravado: unknown;
    const cliente = clienteHml({ segredos: [], fetch: (async () => { quantidade++; return new Response('{"code":"NEGOCIO","message":"TITULO INEXISTENTE"}', { status }); }) as typeof fetch, iniciar: async () => "id", finalizar: async (_id, log) => { gravado = log; } });
    await assertRejects(() => cliente("/gateway/cobrancas/v1/boletos", "POST", {}), FalhaSafra, "TITULO INEXISTENTE");
    assertEquals(quantidade, 1);
    assertEquals((gravado as Record<string, unknown>).http_status, status);
    assertEquals((gravado as Record<string, unknown>).erro_codigo, "NEGOCIO");
  });
}
Deno.test("log indisponível impede request externo", async () => {
  let chamadas = 0;
  const cliente = clienteHml({ segredos: [], fetch: (async () => { chamadas++; return new Response(); }) as typeof fetch, iniciar: async () => { throw new Error("log indisponível"); }, finalizar: async () => {} });
  await assertRejects(() => cliente("/gateway/cobrancas/v1/boletos", "POST", {}), Error, "log indisponível");
  assertEquals(chamadas, 0);
});