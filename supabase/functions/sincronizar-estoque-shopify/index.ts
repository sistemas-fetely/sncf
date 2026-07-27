import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2026-04";
const CANDIDATE_DOMAINS = ["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getSecret(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_vault_secret", { p_name: name });
  if (error || !data) return null;
  return String(data);
}

async function exchangeToken(domain: string, clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

async function gql(domain: string, token: string, query: string, variables: unknown) {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { parseError: text.slice(0, 500) }; }
  return { status: res.status, body };
}

const MUT = `
mutation set($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    userErrors { field message }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: confia no verify_jwt padrão (chamada autenticada da UI).

    // Body — sem body ou dry_run ausente = dry_run true (safe default)
    let dryRun = true;
    try {
      const b = await req.json();
      if (b && b.dry_run === false) dryRun = false;
    } catch { /* sem body → dry_run */ }

    // Lê view
    const { data: rows, error: viewErr } = await supabase
      .from("vw_estoque_shopify_sync")
      .select("sku, inventory_item_id, location_id, shopify_atual, sncf_virtual, diff")
      .neq("diff", 0);
    if (viewErr) return json(500, { error: `view: ${viewErr.message}` });

    const alvos = rows ?? [];
    const reduzir = alvos.filter((r: any) => Number(r.diff) < 0).length;
    const aumentar = alvos.filter((r: any) => Number(r.diff) > 0).length;

    if (dryRun) {
      const exemplos = [...alvos]
        .sort((a: any, b: any) => Number(a.diff) - Number(b.diff))
        .slice(0, 20)
        .map((r: any) => ({
          sku: r.sku,
          shopify_atual: Number(r.shopify_atual),
          sncf_virtual: Number(r.sncf_virtual),
          diff: Number(r.diff),
        }));
      return json(200, { dry_run: true, total_mudariam: alvos.length, reduzir, aumentar, exemplos });
    }

    // Auth Shopify
    const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
    const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json(500, { error: "shopify creds ausentes no vault" });

    const storedDomain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
    const domainsToTry = storedDomain ? [storedDomain] : CANDIDATE_DOMAINS;
    let domain: string | null = null;
    let token: string | null = null;
    for (const d of domainsToTry) {
      const t = await exchangeToken(d, clientId, clientSecret);
      if (t) { domain = d; token = t; break; }
    }
    if (!domain || !token) return json(500, { error: "nenhum dominio shopify autenticou", tried: domainsToTry });

    // Push em lotes de 100
    const BATCH = 100;
    let empurrados = 0;
    let batches = 0;
    const erros: any[] = [];

    for (let i = 0; i < alvos.length; i += BATCH) {
      const slice = alvos.slice(i, i + BATCH);
      const quantities = slice.map((r: any) => ({
        inventoryItemId: `gid://shopify/InventoryItem/${r.inventory_item_id}`,
        locationId: `gid://shopify/Location/${r.location_id}`,
        quantity: Math.trunc(Number(r.sncf_virtual)),
      }));
      const input = {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities,
      };
      batches++;
      const res = await gql(domain, token, MUT, { input });
      if (res.status !== 200) {
        erros.push({ batch: batches, http: res.status, body: res.body });
        continue;
      }
      const ue = res.body?.data?.inventorySetQuantities?.userErrors;
      if (ue && ue.length > 0) {
        erros.push({ batch: batches, userErrors: ue });
      } else {
        empurrados += quantities.length;
      }
    }

    return json(200, { dry_run: false, empurrados, erros, batches });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
