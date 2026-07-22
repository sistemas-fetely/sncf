import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2026-04";
const CANDIDATE_DOMAINS = ["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getSecret(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_vault_secret", { p_name: name });
  if (error || !data) return null;
  return String(data);
}

async function log(supabase: any, etapa: string, detalhe: unknown) {
  try {
    await supabase.from("shopify_webhook_log").insert({ topic: "pagamento_sync", etapa, detalhe });
  } catch (_) {}
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

function txList(node: any): any[] {
  const t = node?.transactions;
  if (!t) return [];
  if (Array.isArray(t)) return t;
  if (Array.isArray(t?.edges)) return t.edges.map((e: any) => e.node);
  return [];
}

function extrairToken(txs: any[]): string | null {
  for (const tx of txs) {
    const cand = tx?.paymentId ?? tx?.authorizationCode ?? tx?.accountNumber ?? null;
    if (cand && String(cand).trim() !== "") return String(cand).trim();
  }
  return null;
}

const QUERY = `
query recentes($n: Int!) {
  orders(first: $n, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        name
        transactions {
          id
          gateway
          kind
          status
          paymentId
          authorizationCode
          accountNumber
        }
      }
    }
  }
}`;

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const provided = req.headers.get("x-cron-secret");
  const expected = await getSecret(supabase, "SYNC_CRON_SECRET");
  if (!expected || provided !== expected) {
    return json(401, { error: "unauthorized" });
  }

  const url = new URL(req.url);
  const probe = url.searchParams.get("probe") === "1";
  const nFetch = Math.min(parseInt(url.searchParams.get("n") ?? "50", 10) || 50, 100);

  const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
  const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    await log(supabase, "erro", { motivo: "creds_ausentes" });
    return json(500, { error: "shopify creds ausentes no vault" });
  }

  const storedDomain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
  const domainsToTry = storedDomain ? [storedDomain] : CANDIDATE_DOMAINS;
  let domain: string | null = null;
  let token: string | null = null;
  for (const d of domainsToTry) {
    const t = await exchangeToken(d, clientId, clientSecret);
    if (t) { domain = d; token = t; break; }
  }
  if (!domain || !token) {
    await log(supabase, "erro", { motivo: "sem_dominio", tried: domainsToTry });
    return json(502, { error: "nenhum dominio autenticou", tried: domainsToTry });
  }

  const r = await gql(domain, token, QUERY, { n: probe ? 5 : nFetch });
  if (r.status !== 200 || r.body?.errors) {
    await log(supabase, "erro_graphql", { domain, status: r.status, errors: r.body?.errors ?? r.body });
    return json(502, { error: "graphql falhou", domain, status: r.status, errors: r.body?.errors ?? r.body });
  }

  const edges = r.body?.data?.orders?.edges ?? [];

  if (probe) {
    const amostra: any[] = [];
    for (const e of edges) {
      const node = e.node;
      const txs = txList(node);
      const { data: mapRow } = await supabase
        .from("shopify_pagamento_ref")
        .select("token")
        .eq("order_name", node.name)
        .limit(1)
        .maybeSingle();
      amostra.push({
        order_name: node.name,
        token_no_mapa: mapRow?.token ?? null,
        transactions: txs,
        extraido: extrairToken(txs),
      });
    }
    await log(supabase, "probe", { domain, amostra });
    return json(200, { ok: true, modo: "probe", domain, amostra });
  }

  const { data: mapped } = await supabase.from("shopify_pagamento_ref").select("order_name");
  const mappedSet = new Set((mapped ?? []).map((r: any) => r.order_name));

  let inseridos = 0;
  let semToken = 0;
  const detalhes: any[] = [];
  for (const e of edges) {
    const node = e.node;
    if (mappedSet.has(node.name)) continue;
    const txs = txList(node);
    const tok = extrairToken(txs);
    if (!tok) { semToken++; continue; }
    const gid = String(node.id ?? "");
    const m = gid.match(/Order\/(\d+)/);
    const shopify_id = m ? m[1] : null;
    const { error: upErr } = await supabase
      .from("shopify_pagamento_ref")
      .upsert({ order_name: node.name, shopify_id, token: tok, fonte: "api_shopify" }, { onConflict: "token" });
    if (!upErr) { inseridos++; detalhes.push({ order_name: node.name, token: tok }); }
    else detalhes.push({ order_name: node.name, erro: upErr.message });
  }
  await log(supabase, "run", { domain, fetched: edges.length, inseridos, semToken });
  return json(200, { ok: true, modo: "run", domain, fetched: edges.length, inseridos, semToken, detalhes });
});
