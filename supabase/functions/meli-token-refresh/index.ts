// Mercado Livre — renovação de token (cron a cada 4 h). Usa o shared; nunca loga token.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { meliAccessToken } from "../_shared/meli/token.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, db, corsHeaders);
  if (negado) return negado;
  const { data: contas, error } = await db.from("meli_conta").select("codigo").eq("ativo", true).not("seller_id", "is", null).order("ordem");
  if (error) return json({ ok: false, erro: `Falha ao ler contas: ${error.message}` }, 500);
  const resultado: { conta: string; ok: boolean; erro?: string; expira_em?: string | null }[] = [];
  for (const c of contas ?? []) {
    try {
      await meliAccessToken(db, c.codigo);
      const { data } = await db.from("meli_conta").select("token_expira_em").eq("codigo", c.codigo).single();
      resultado.push({ conta: c.codigo, ok: true, expira_em: data?.token_expira_em ?? null });
    } catch (e) { resultado.push({ conta: c.codigo, ok: false, erro: e instanceof Error ? e.message : String(e) }); }
  }
  const ok = resultado.every((r) => r.ok);
  return json({ ok, contas: resultado }, ok ? 200 : 502);
});
