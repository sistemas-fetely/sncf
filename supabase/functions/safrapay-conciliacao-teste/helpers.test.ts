import { entrada, tentativas, qtdeItens, lerCorpo, semSegredos, baseSegura } from "./helpers.ts";
import { assertEquals, assertThrows } from "jsr:@std/assert";

Deno.test("datas padrão abrangem 45 dias até hoje UTC", () => {
  assertEquals(entrada({}, new Date("2026-11-13T22:02:00Z")), { start: "2026-09-29", end: "2026-11-13", bases: [] });
});
Deno.test("valida datas e bases sem enviar credenciais a terceiros", () => {
  assertThrows(() => entrada({ start_date: "2026-02-30" }));
  assertThrows(() => entrada({ start_date: "2026-11-14", end_date: "2026-11-13" }));
  assertThrows(() => entrada({ bases: ["https://example.com"] }));
  assertThrows(() => baseSegura("https://payment.safrapay.com.br@evil.com"));
  assertThrows(() => baseSegura("http://payment.safrapay.com.br"));
  assertThrows(() => baseSegura("https://payment.safrapay.com.br/?token=x"));
  assertEquals(baseSegura("https://payment-hml.safrapay.com.br/"), "https://payment-hml.safrapay.com.br");
});
Deno.test("cinco tentativas ordenadas e só 1–3 repetidas por base", () => {
  const t = tentativas("https://payment.safrapay.com.br", "EC", "2026-09-29", "2026-11-13", ["https://payment-hml.safrapay.com.br"]);
  assertEquals(t.length, 8);
  assertEquals(t.slice(0, 5).map((v) => v.tentativa), ["v1/Reconciliation/Transactions", "v2/Reconciliation/Transactions", "v1/Reconciliation", "v1/TaxPlan", "v1/Adjustments"]);
  const u = new URL(t[0].url);
  assertEquals(u.searchParams.get("merchantId"), "EC");
  assertEquals(u.searchParams.get("startDate"), "2026-09-29 00:00:00");
  assertEquals(u.searchParams.get("endDate"), "2026-11-13 23:59:59");
  assertEquals(new URL(t[2].url).searchParams.get("date"), "2026-11-13");
  assertEquals(new URL(t[7].url).pathname, "/v1/Reconciliation");
});
Deno.test("conta arrays sem confundir ausência e vazio", () => {
  assertEquals(qtdeItens([{}, {}]), 2);
  assertEquals(qtdeItens({ data: { transactions: [{}, {}, {}] } }), 3);
  assertEquals(qtdeItens({ items: [] }), 0);
  assertEquals(qtdeItens({ message: "falhou" }), null);
});
Deno.test("corpo de texto completo sem limite de 2000 caracteres", async () => {
  const texto = "a".repeat(5000);
  assertEquals(await lerCorpo(new Response(texto)), { texto });
  assertEquals(await lerCorpo(new Response('[{"id":1}]')), [{ id: 1 }]);
});
Deno.test("nunca persiste tokens ecoados, mantém dados de conciliação", () => {
  assertEquals(semSegredos({ accessToken: "fake", data: [{ amount: 10, message: "Bearer fake" }] }, ["fake"]), { accessToken: "[REDACTED]", data: [{ amount: 10, message: "Bearer [REDACTED]" }] });
});