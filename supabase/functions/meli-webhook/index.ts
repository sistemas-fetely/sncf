// Mercado Livre — receptor de notificações (F0: só grava em meli_eventos_raw; processamento é F1).
// Público (o ML não manda JWT): confere application_id = client_id do Vault e user_id = seller da conta.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({
  resource: z.string().max(500), user_id: z.coerce.number(), topic: z.string().max(100),
  application_id: z.coerce.number(), attempts: z.coerce.number().optional(), sent: z.string().optional(), received: z.string().optional(),
}).passthrough();

let cache: { em: number; apps: Set<number>; sellers: Set<number> } | null = null;
async function conhecidos(db: any) {
  if (cache && Date.now() - cache.em < 300_000) return cache;
  const { data } = await db.from("meli_conta").select("segredo_client_id,seller_id").eq("ativo", true);
  const apps = new Set<number>(), sellers = new Set<number>();
  for (const c of data ?? []) {
    const { data: id } = await db.rpc("get_vault_secret", { p_name: c.segredo_client_id });
    if (id) apps.add(Number(id));
    if (c.seller_id) sellers.add(Number(c.seller_id));
  }
  cache = { em: Date.now(), apps, sellers };
  return cache;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false }, 405);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, erro: "payload inválido" }, 400);
  const n = parsed.data;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const k = await conhecidos(db);
  if (!k.apps.has(n.application_id)) return json({ ok: false, erro: "aplicação desconhecida" }, 403);
  if (k.sellers.size && !k.sellers.has(n.user_id)) return json({ ok: false, erro: "vendedor desconhecido" }, 403);
  const { error } = await db.from("meli_eventos_raw").insert({
    topic: n.topic, resource: n.resource, user_id: n.user_id, application_id: n.application_id,
    attempts: n.attempts ?? null, sent: n.sent ?? null, payload: n,
  });
  // 23505 = notificação repetida (índice único parcial topic+resource+sent): idempotente.
  if (error && error.code !== "23505") return json({ ok: false, erro: "falha ao registrar" }, 500);
  return json({ ok: true });
});
