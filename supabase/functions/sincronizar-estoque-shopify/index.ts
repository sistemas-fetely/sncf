import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const API_VERSION = "2026-04";
const CANDIDATE_DOMAINS = ["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function getSecret(sb: any, n: string) { const { data, error } = await sb.rpc("get_vault_secret", { p_name: n }); return error || !data ? null : String(data); }
async function exchangeToken(domain: string, id: string, sec: string) {
  try {
    const r = await fetch(`https://${domain}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: sec }).toString() });
    if (!r.ok) return null; const d = await r.json(); return d?.access_token ?? null;
  } catch { return null; }
}
async function gql(domain: string, token: string, query: string, variables: unknown) {
  const r = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, { method: "POST", headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token }, body: JSON.stringify({ query, variables }) });
  const t = await r.text(); let b: any = null; try { b = JSON.parse(t); } catch { b = { parseError: t.slice(0, 500) }; } return { status: r.status, body: b };
}
const MUT = `mutation set($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { userErrors { field message } } }`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    let dryRun = true;
    try { const b = await req.json(); if (b?.dry_run === false) dryRun = false; } catch (_) {}
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows, error } = await sb.from("vw_estoque_shopify_sync").select("*").neq("delta", 0);
    if (error) throw new Error(error.message);
    const alvos = rows || [];
    const irZero = alvos.filter((r: any) => Number(r.sncf_virtual) <= 0).length;
    const resumo = { total: alvos.length, delta_pos: alvos.filter((r: any) => r.delta > 0).length, delta_neg: alvos.filter((r: any) => r.delta < 0).length, iriam_a_zero: irZero };
    if (dryRun) return json(200, { dry_run: true, ...resumo, amostra: alvos.slice(0, 10) });
    if (alvos.length > 0 && irZero / alvos.length > 0.5) return json(409, { error: "Guard: >50% iriam a zero — push abortado", ...resumo });
    const id = await getSecret(sb, "SHOPIFY_CLIENT_ID"), sec = await getSecret(sb, "SHOPIFY_CLIENT_SECRET");
    if (!id || !sec) return json(500, { error: "shopify creds ausentes no vault" });
    const stored = await getSecret(sb, "SHOPIFY_STORE_DOMAIN");
    let domain: string | null = null, token: string | null = null;
    for (const d of (stored ? [stored] : CANDIDATE_DOMAINS)) { const t = await exchangeToken(d, id, sec); if (t) { domain = d; token = t; break; } }
    if (!domain || !token) return json(502, { error: "nenhum dominio autenticou" });
    let ok = 0, fail = 0; const erros: any[] = [];
    for (const r of alvos) {
      const input = { name: "available", reason: "correction", ignoreCompareQuantity: true, quantities: [{ inventoryItemId: `gid://shopify/InventoryItem/${r.inventory_item_id}`, locationId: `gid://shopify/Location/${r.location_id}`, quantity: Math.max(0, Math.trunc(Number(r.sncf_virtual))) }] };
      const res = await gql(domain, token, MUT, { input });
      const ue = res.body?.data?.inventorySetQuantities?.userErrors;
      if (res.status === 200 && (!ue || ue.length === 0)) ok++; else { fail++; if (erros.length < 5) erros.push({ sku: r.sku, err: ue || res.body?.errors || res.status }); }
    }
    return json(200, { dry_run: false, ...resumo, aplicados: ok, falhas: fail, erros });
  } catch (e) { return json(500, { error: (e as Error).message }); }
});
