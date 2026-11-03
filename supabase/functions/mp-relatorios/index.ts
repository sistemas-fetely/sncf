// Mercado Pago — relatórios automáticos (Fase 1). Esqueleto de diagnóstico.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const MP = "https://api.mercadopago.com/v1/account";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, db, corsHeaders);
  if (negado) return negado;
  const { data: token } = await db.rpc("get_vault_secret", { p_name: "mp_access_token" });
  if (!token) return json({ ok: false, erro: "mp_access_token não cadastrado" }, 400);
  const body = await req.json().catch(() => ({}));
  const get = async (p: string) => {
    const r = await fetch(`${MP}/${p}`, { headers: { Authorization: `Bearer ${token}` } });
    const t = (await r.text()).replaceAll(String(token), "***");
    return { status: r.status, corpo: t.slice(0, body?.tam ?? 3000) };
  };
  if (body?.acao === "diagnostico") {
    return json({
      release_config: await get("release_report/config"),
      release_list: await get("release_report/list"),
      settlement_config: await get("settlement_report/config"),
      settlement_list: await get("settlement_report/list"),
    });
  }
  if (body?.acao === "post_teste") {
    const r = await fetch(`${MP}/${body.tipo}_report`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ begin_date: body.begin, end_date: body.end }) });
    return json({ status: r.status, corpo: (await r.text()).slice(0, 2000) });
  }
  if (body?.acao === "baixar_teste") {
    const r = await fetch(`${MP}/${body.tipo}_report/${body.file_name}`, { headers: { Authorization: `Bearer ${token}` } });
    const b = new Uint8Array(await r.arrayBuffer());
    let bin = ""; for (const x of b) bin += String.fromCharCode(x);
    return json({ status: r.status, tipo: r.headers.get("content-type"), bytes: b.length, b64: btoa(bin) });
  }
  if (body?.acao === "testar_csv" && typeof body.file_name === "string" && /^[\w.-]+\.csv$/.test(body.file_name)) {
    const tipo = body.tipo === "settlement" ? "settlement_report" : "release_report";
    return json(await get(`${tipo}/${body.file_name}`));
  }
  return json({ ok: false, erro: "ação inválida" }, 400);
});
