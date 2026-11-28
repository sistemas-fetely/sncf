import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { meliAccessToken, precisaRenovar } from "./token.ts";

const AGORA = Date.parse("2026-11-28T12:00:00Z");
function fakeDb(expiraEm: string | null, opts: { reservado?: boolean } = {}) {
  const st: any = { conta: { codigo: "C", segredo_client_id: "cid", segredo_client_secret: "cs", segredo_access_token: "at", segredo_refresh_token: "rt", token_expira_em: expiraEm, ultimo_refresh_em: "x" }, cofre: { cid: "1", cs: "2", at: "OLD", rt: "R1" }, reservado: !!opts.reservado, chamadas: [] as string[] };
  st.db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...st.conta }, error: null }) }) }) }),
    rpc: async (n: string, a: any) => {
      st.chamadas.push(n);
      if (n === "get_vault_secret") return { data: st.cofre[a.p_name] ?? null, error: null };
      if (n === "fn_meli_reservar_refresh") { if (st.reservado) return { data: false, error: null }; st.reservado = true; return { data: true, error: null }; }
      if (n === "fn_meli_gravar_tokens") { st.cofre.at = a.p_access; st.cofre.rt = a.p_refresh; st.conta.token_expira_em = a.p_expira_em; st.conta.ultimo_refresh_em = "novo"; st.reservado = false; return { data: {}, error: null }; }
      if (n === "fn_meli_registrar_erro_token") { st.erro = a.p_erro; st.reservado = false; return { data: null, error: null }; }
      if (n === "fn_meli_liberar_refresh") { st.reservado = false; return { data: null, error: null }; }
      return { data: null, error: null };
    },
  };
  return st;
}
const fetchOk = (cont: { n: number }) => (async (_u: any, init: any) => { cont.n++; assert(String(init.body).includes("refresh_token=R1")); return new Response(JSON.stringify({ access_token: "NEW", refresh_token: "R2", expires_in: 21600 })); }) as typeof fetch;
const deps = (f: typeof fetch) => ({ fetch: f, agora: () => AGORA, esperar: async () => {} });

Deno.test("precisaRenovar: <60 min renova, >60 não", () => {
  assert(precisaRenovar(new Date(AGORA + 59 * 60_000).toISOString(), AGORA));
  assert(!precisaRenovar(new Date(AGORA + 61 * 60_000).toISOString(), AGORA));
  assert(precisaRenovar(null, AGORA));
});
Deno.test("token com folga não renova", async () => {
  const st = fakeDb(new Date(AGORA + 3 * 3600_000).toISOString()); const c = { n: 0 };
  assertEquals(await meliAccessToken(st.db, "C", { deps: deps(fetchOk(c)) }), "OLD"); assertEquals(c.n, 0);
});
Deno.test("faltando <60 min renova e grava antes de devolver", async () => {
  const st = fakeDb(new Date(AGORA + 30 * 60_000).toISOString()); const c = { n: 0 };
  assertEquals(await meliAccessToken(st.db, "C", { deps: deps(fetchOk(c)) }), "NEW");
  assertEquals(c.n, 1); assertEquals(st.cofre.rt, "R2");
});
Deno.test("duas chamadas seguidas gastam o refresh uma vez só", async () => {
  const st = fakeDb(new Date(AGORA + 10 * 60_000).toISOString()); const c = { n: 0 };
  await meliAccessToken(st.db, "C", { deps: deps(fetchOk(c)) });
  assertEquals(await meliAccessToken(st.db, "C", { deps: deps(fetchOk(c)) }), "NEW");
  assertEquals(c.n, 1);
});
Deno.test("reserva tomada por outra execução: não chama o ML", async () => {
  const st = fakeDb(new Date(AGORA + 10 * 60_000).toISOString(), { reservado: true }); const c = { n: 0 };
  await assertRejects(() => meliAccessToken(st.db, "C", { deps: deps(fetchOk(c)) }));
  assertEquals(c.n, 0);
});
Deno.test("falha no refresh registra erro e é fail-loud", async () => {
  const st = fakeDb(null);
  const f = (async () => new Response(JSON.stringify({ error: "invalid_grant", message: "expired" }), { status: 400 })) as typeof fetch;
  await assertRejects(() => meliAccessToken(st.db, "C", { deps: deps(f) }), Error, "invalid_grant");
  assert(st.erro.includes("HTTP 400")); assert(!st.erro.includes("R1"));
  assert(st.chamadas.includes("fn_meli_registrar_erro_token"));
});
