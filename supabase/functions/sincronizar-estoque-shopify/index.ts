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
mutation set($input: InventorySetQuantitiesInput!, $key: String!) {
  inventorySetQuantities(input: $input) @idempotent(key: $key) {
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

const MUT_ATIVAR = `
mutation ativar($item: ID!, $loc: ID!, $key: String!) {
  inventoryActivate(inventoryItemId: $item, locationId: $loc, available: 0) @idempotent(key: $key) {
    inventoryLevel { id }
    userErrors { field message }
  }
}`;
const TETO_ATIVAR = 200;

async function ativarLocation(supabase: any, locationId: string | null, dryRun: boolean): Promise<Response> {
  const t0 = Date.now();
  if (!locationId) return json(400, { error: "location_id obrigatório" });
  const { data: loc, error: lErr } = await supabase.from("shopify_location")
    .select("location_id, nome, centro_id").eq("location_id", locationId).maybeSingle();
  if (lErr) return json(500, { error: `shopify_location: ${lErr.message}` });
  if (!loc) return json(400, { error: `location ${locationId} não existe em shopify_location` });
  if (!loc.centro_id) return json(400, { error: `location ${locationId} (${loc.nome}) sem centro_id — amarre a um centro antes` });

  const prods: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("shopify_produtos")
      .select("variants, status, has_variants_that_requires_components")
      .ilike("status", "active").range(de, de + 999);
    if (error) return json(500, { error: `shopify_produtos: ${error.message}` });
    prods.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const cand = new Map<string, string>();
  for (const p of prods) {
    if (p.has_variants_that_requires_components === true) continue; // kits/bundles
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      if (!v?.sku || v?.inventory_item_id == null) continue;
      const id = String(v.inventory_item_id);
      if (!cand.has(id)) cand.set(id, String(v.sku));
    }
  }
  const ja = new Set<string>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from("shopify_estoque")
      .select("inventory_item_id").eq("location_id", locationId).range(de, de + 999);
    if (error) return json(500, { error: `shopify_estoque: ${error.message}` });
    for (const r of data ?? []) ja.add(String(r.inventory_item_id));
    if (!data || data.length < 1000) break;
  }
  const alvos = [...cand.entries()].filter(([id]) => !ja.has(id))
    .map(([inventory_item_id, sku]) => ({ sku, inventory_item_id }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  if (dryRun) {
    return json(200, { dry_run: true, location: loc.nome, total_a_ativar: alvos.length, exemplos: alvos.slice(0, 20) });
  }

  const processar = alvos.slice(0, TETO_ATIVAR);
  const restantes = alvos.length - processar.length;
  let ativados = 0;
  const falhas: any[] = [];
  const log = async (status: string) => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "shopify", tipo: "estoque_ativar_location", status,
      registros_atualizados: ativados, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify({ location_id: locationId, ativados, falhas, restantes }),
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

    for (let k = 0; k < processar.length; k++) {
      const a = processar[k];
      if (k > 0) await dormir(250);
      let r: any = null;
      for (let tent = 0; tent < 8; tent++) {
        r = await gql(domain, token, MUT_ATIVAR, {
          item: `gid://shopify/InventoryItem/${a.inventory_item_id}`,
          loc: `gid://shopify/Location/${locationId}`,
          key: crypto.randomUUID(),
        });
        const errs = r.body?.errors;
        const throttled = r.status === 429 ||
          (Array.isArray(errs) && errs.some((e: any) => e?.extensions?.code === "THROTTLED"));
        if (!throttled) break;
        await dormir(2000 * (tent + 1));
      }
      if (r.status !== 200) { falhas.push({ ...a, erro: `HTTP ${r.status}`, corpo: r.body }); continue; }
      if (Array.isArray(r.body?.errors) && r.body.errors.length) { falhas.push({ ...a, graphqlErrors: r.body.errors }); continue; }
      const ue = r.body?.data?.inventoryActivate?.userErrors ?? [];
      if (ue.length) { falhas.push({ ...a, userErrors: ue }); continue; }
      ativados++;
      const ts = new Date().toISOString();
      const { error } = await supabase.from("shopify_estoque").upsert({
        inventory_item_id: a.inventory_item_id, location_id: locationId, available: 0,
        updated_at_shopify: ts, updated_at: ts,
      }, { onConflict: "inventory_item_id,location_id" });
      if (error) falhas.push({ ...a, erro: `Shopify ativou, espelho falhou: ${error.message}` });
    }
    await log(falhas.length ? (ativados ? "parcial" : "erro") : "sucesso");
    return json(200, { ativados, falhas, restantes });
  } catch (e) {
    const msg = (e as Error).message;
    falhas.push({ erro: msg });
    await log("erro");
    return json(500, { error: msg, ativados, falhas, restantes });
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
    let locationIdBody: string | null = null;
    try {
      const b = await req.json();
      if (b && b.dry_run === false) dryRun = false;
      if (b && typeof b.modo === "string") modo = b.modo;
      if (b && b.location_id != null) locationIdBody = String(b.location_id).trim();
      if (b && Array.isArray(b.skus) && b.skus.length > 0) {
        skus = b.skus.map((s: unknown) => String(s).trim()).filter((s: string) => s !== "");
        if (skus.length === 0) skus = null;
      }
    } catch { /* sem body → dry_run */ }

    if (modo === "carga_completa" || modo === "ativar_location") {
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
      if (modo === "ativar_location") return await ativarLocation(supabase, locationIdBody, dryRun);
      return await cargaCompleta(supabase);
    }

    // Lê view (filtro opcional por skus)
    let consulta = supabase
      .from("vw_estoque_shopify_sync")
      .select("sku, inventory_item_id, location_id, shopify_atual, sncf_virtual, diff")
      .neq("diff", 0)
      .order("sku");
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
    const itens_inexistentes: any[] = [];

    // Extrai índices de entradas mortas ("inventory item could not be found")
    const idxInexistentes = (ues: any[]): number[] => {
      const idx: number[] = [];
      for (const e of ues) {
        const f = e?.field;
        const msg = String(e?.message ?? "");
        if (
          Array.isArray(f) && f.length === 4 &&
          f[0] === "input" && f[1] === "quantities" &&
          f[3] === "inventoryItemId" &&
          msg.includes("could not be found")
        ) {
          const n = Number(f[2]);
          if (Number.isInteger(n)) idx.push(n);
        }
      }
      return idx;
    };

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
        // Lote atômico: se TODOS os erros forem "item inexistente", reenvia sem eles (1x)
        const mortos = idxInexistentes(ue);
        if (mortos.length > 0 && mortos.length === ue.length) {
          const vivos = quantities.filter((_: unknown, k: number) => !mortos.includes(k));
          for (const m of mortos) {
            itens_inexistentes.push({
              sku: slice[m]?.sku ?? null,
              inventory_item_id: slice[m]?.inventory_item_id ?? null,
            });
          }
          if (vivos.length === 0) continue; // lote inteiro era carcaça
          const res2 = await gql(domain, token, MUT, {
            input: { ...input, quantities: vivos },
            key: crypto.randomUUID(),
          });
          const ue2 = res2.body?.data?.inventorySetQuantities?.userErrors;
          const top2 = res2.body?.errors;
          if (
            res2.status === 200 &&
            !(Array.isArray(top2) && top2.length > 0) &&
            !(ue2 && ue2.length > 0)
          ) {
            empurrados += vivos.length;
          } else {
            erros.push({ batch: batches, reenvio: true, http: res2.status, graphqlErrors: top2, userErrors: ue2 });
          }
        } else {
          erros.push({ batch: batches, userErrors: ue });
        }
      } else {
        empurrados += quantities.length;
      }
    }

    return json(200, { dry_run: false, empurrados, erros, batches, itens_inexistentes });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
