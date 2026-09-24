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
mutation set($input: InventorySetQuantitiesInput!, $key: String!) @idempotent(key: $key) {
  inventorySetQuantities(input: $input) {
    userErrors { field message }
  }
}`;


const numGid = (gid: string) => String(gid).match(/(\d+)\s*$/)?.[1] ?? String(gid);
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const Q_LOC = `{ locations(first: 20) { nodes { id name isActive } } }`;
const Q_LVL = `
query lv($id: ID!, $cursor: String) {
  location(id: $id) {
    inventoryLevels(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { quantities(names: ["available"]) { name quantity } item { id sku } }
    }
  }
}`;

async function cargaCompleta(supabase: any): Promise<Response> {
  const t0 = Date.now();
  const itens_por_location: Record<string, number> = {};
  let paginas = 0;
  let nLoc = 0;
  const log = async (status: string, total: number, detalhes: unknown) => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "shopify", tipo: "estoque_carga_completa", status,
      registros_atualizados: total, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify(detalhes),
    });
    if (error) console.error("log:", error.message);
  };
  try {
    const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
    const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("shopify creds ausentes no vault");
    const storedDomain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
    const domainsToTry = storedDomain ? [storedDomain.trim()] : CANDIDATE_DOMAINS;
    let domain: string | null = null, token: string | null = null;
    for (const d of domainsToTry) {
      const t = await exchangeToken(d, clientId, clientSecret);
      if (t) { domain = d; token = t; break; }
    }
    if (!domain || !token) throw new Error(`nenhum dominio shopify autenticou: ${domainsToTry.join(", ")}`);

    const chamar = async (q: string, v: unknown) => {
      for (let tent = 0; tent < 8; tent++) {
        const r = await gql(domain!, token!, q, v);
        const errs = r.body?.errors;
        const throttled = r.status === 429 ||
          (Array.isArray(errs) && errs.some((e: any) => e?.extensions?.code === "THROTTLED"));
        if (throttled) { await dormir(2000 * (tent + 1)); continue; }
        if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.body).slice(0, 400)}`);
        if (Array.isArray(errs) && errs.length) throw new Error(`GraphQL: ${JSON.stringify(errs).slice(0, 400)}`);
        return r.body.data;
      }
      throw new Error("Shopify throttled após 8 tentativas");
    };

    const dl = await chamar(Q_LOC, {});
    const locs = (dl?.locations?.nodes ?? []) as any[];
    nLoc = locs.length;
    const agora = new Date().toISOString();
    if (locs.length) {
      const { error } = await supabase.from("shopify_location").upsert(
        locs.map((l) => ({ location_id: numGid(l.id), nome: l.name, ativo_shopify: !!l.isActive, atualizado_em: agora })),
        { onConflict: "location_id" },
      );
      if (error) throw new Error(`upsert shopify_location: ${error.message}`);
    }

    for (const l of locs) {
      const locId = numGid(l.id);
      itens_por_location[locId] = 0;
      let cursor: string | null = null;
      while (true) {
        const d = await chamar(Q_LVL, { id: l.id, cursor });
        paginas++;
        const conn = d?.location?.inventoryLevels;
        const nodes = (conn?.nodes ?? []) as any[];
        const ts = new Date().toISOString();
        const linhas = nodes.filter((n) => n?.item?.id).map((n) => ({
          inventory_item_id: numGid(n.item.id),
          location_id: locId,
          available: Number(n.quantities?.find((q: any) => q.name === "available")?.quantity ?? 0),
          updated_at_shopify: ts,
          updated_at: ts,
        }));
        if (linhas.length) {
          const { error } = await supabase.from("shopify_estoque")
            .upsert(linhas, { onConflict: "inventory_item_id,location_id" });
          if (error) throw new Error(`upsert shopify_estoque (loc ${locId}): ${error.message}`);
        }
        itens_por_location[locId] += linhas.length;
        if (!conn?.pageInfo?.hasNextPage) break;
        cursor = conn.pageInfo.endCursor;
        await dormir(300);
      }
    }

    const total = Object.values(itens_por_location).reduce((a, b) => a + b, 0);
    const locsResumo = locs.map((l) => ({ location_id: numGid(l.id), nome: l.name, ativo: !!l.isActive }));
    await log("sucesso", total, { locations: locsResumo, itens_por_location, paginas });
    return json(200, { locations: nLoc, itens_por_location, paginas, detalhe_locations: locsResumo });
  } catch (e) {
    const msg = (e as Error).message;
    const total = Object.values(itens_por_location).reduce((a, b) => a + b, 0);
    await log("erro", total, { erro: msg, itens_por_location, paginas });
    return json(500, { error: msg, locations: nLoc, itens_por_location, paginas });
  }
}

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
    let modo: string | null = null;
    let skus: string[] | null = null;
    try {
      const b = await req.json();
      if (b && b.dry_run === false) dryRun = false;
      if (b && typeof b.modo === "string") modo = b.modo;
      if (b && Array.isArray(b.skus) && b.skus.length > 0) {
        skus = b.skus.map((s: unknown) => String(s).trim()).filter((s: string) => s !== "");
        if (skus.length === 0) skus = null;
      }
    } catch { /* sem body → dry_run */ }

    if (modo === "carga_completa") {
      // Auth explícita: x-cron-secret OU sessão válida
      const cron = req.headers.get("x-cron-secret");
      if (cron) {
        const esperado = await getSecret(supabase, "SYNC_CRON_SECRET");
        if (!esperado || cron !== esperado) return json(401, { error: "x-cron-secret inválido" });
      } else {
        const tk = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
        const { data: u, error: ue } = await supabase.auth.getUser(tk);
        if (ue || !u?.user) return json(401, { error: "sessão inválida" });
      }
      return await cargaCompleta(supabase);
    }

    // Lê view (filtro opcional por skus)
    let consulta = supabase
      .from("vw_estoque_shopify_sync")
      .select("sku, inventory_item_id, location_id, shopify_atual, sncf_virtual, diff")
      .neq("diff", 0);
    if (skus) consulta = consulta.in("sku", skus);
    const { data: rows, error: viewErr } = await consulta;
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
        // Concorrência segura: só grava se o valor no Shopify ainda for o que lemos.
        changeFromQuantity: Math.trunc(Number(r.shopify_atual)),
      }));
      const input = {
        name: "available",
        reason: "correction",
        quantities,
      };
      batches++;
      const res = await gql(domain, token, MUT, { input, key: crypto.randomUUID() });
      if (res.status !== 200) {
        erros.push({ batch: batches, http: res.status, body: res.body });
        continue;
      }
      const topErrs = res.body?.errors;
      if (Array.isArray(topErrs) && topErrs.length > 0) {
        erros.push({ batch: batches, graphqlErrors: topErrs });
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
