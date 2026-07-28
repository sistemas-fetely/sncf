import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2026-04";
const MAX_PAGES = 100;
const PAGE_SIZE = 100;
const UPSERT_BATCH = 100;
const COST_MIN_AVAILABLE = 200;

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

async function gqlWithRetry(
  domain: string,
  token: string,
  query: string,
  variables: unknown
): Promise<{ status: number; body: any }> {
  let tentativas = 0;
  while (true) {
    const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 429) {
      tentativas++;
      if (tentativas >= 4) {
        const text = await res.text();
        throw new Error(`shopify 429 apos 3 retries: ${text.slice(0, 300)}`);
      }
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { body = { parseError: text.slice(0, 500) }; }
    return { status: res.status, body };
  }
}

function extrairIdNumerico(gid: unknown): string | null {
  if (!gid) return null;
  const s = String(gid);
  const last = s.split("/").pop() ?? "";
  return /^\d+$/.test(last) ? last : null;
}

const QUERY = `
query($cursor: String) {
  products(first: ${PAGE_SIZE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id handle title status vendor productType tags createdAt updatedAt
      variants(first: 100) {
        nodes {
          id sku barcode price compareAtPrice position title
          inventoryPolicy
          selectedOptions { name value }
          inventoryItem { id }
          inventoryQuantity
        }
      }
    }
  }
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const inicio = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Guard de invocação
  const provided = req.headers.get("x-cron-secret");
  const expected = await getSecret(supabase, "SYNC_CRON_SECRET");
  if (!expected || provided !== expected) {
    return json(401, { error: "unauthorized" });
  }

  try {
    const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
    const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("SHOPIFY_CLIENT_ID/SECRET ausentes no vault");

    const domain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
    if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN ausente no vault — pull abortado (nao ha fallback seguro)");

    const token = await exchangeToken(domain, clientId, clientSecret);
    if (!token) throw new Error(`falha ao autenticar em ${domain} via client_credentials`);

    const pullLote = crypto.randomUUID();
    const pullEm = new Date().toISOString();

    let cursor: string | null = null;
    let paginas = 0;
    let ignorados = 0;
    let variantesTotais = 0;
    let produtosGravados = 0;
    const erros: any[] = [];

    let buffer: any[] = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const slice = buffer;
      buffer = [];
      const { error } = await supabase
        .from("shopify_catalogo_stage")
        .upsert(slice, { onConflict: "shopify_id" });
      if (error) {
        erros.push({ etapa: "upsert", tamanho: slice.length, message: error.message });
      } else {
        produtosGravados += slice.length;
      }
    };

    while (true) {
      if (paginas >= MAX_PAGES) {
        throw new Error(`limite de ${MAX_PAGES} paginas atingido — abortado apos processar ${paginas} paginas`);
      }
      const res = await gqlWithRetry(domain, token, QUERY, { cursor });
      if (res.status !== 200 || res.body?.errors) {
        throw new Error(`graphql falhou: status=${res.status} errors=${JSON.stringify(res.body?.errors ?? res.body).slice(0, 500)}`);
      }
      paginas++;

      const products = res.body?.data?.products;
      const nodes: any[] = products?.nodes ?? [];

      for (const p of nodes) {
        const shopifyId = extrairIdNumerico(p?.id);
        if (!shopifyId) { ignorados++; continue; }

        const variantNodes: any[] = p?.variants?.nodes ?? [];
        const variants = variantNodes.map((v: any) => {
          const vid = extrairIdNumerico(v?.id);
          const invId = extrairIdNumerico(v?.inventoryItem?.id);
          return {
            id: vid,
            sku: v?.sku ?? null,
            barcode: v?.barcode ?? null,
            price: v?.price ?? null,
            compare_at_price: v?.compareAtPrice ?? null,
            position: v?.position ?? null,
            title: v?.title ?? null,
            inventory_policy: v?.inventoryPolicy ?? null,
            inventory_item_id: invId,
            inventory_quantity: v?.inventoryQuantity ?? null,
            options: Array.isArray(v?.selectedOptions)
              ? v.selectedOptions.map((o: any) => ({ name: o?.name ?? null, value: o?.value ?? null }))
              : [],
          };
        });

        variantesTotais += variants.length;

        buffer.push({
          shopify_id: shopifyId,
          handle: p?.handle ?? "",
          title: p?.title ?? null,
          status: p?.status ?? null,
          vendor: p?.vendor ?? null,
          product_type: p?.productType ?? null,
          tags: Array.isArray(p?.tags) ? p.tags : [],
          criado_shopify: p?.createdAt ?? null,
          atualizado_shopify: p?.updatedAt ?? null,
          variants,
          pull_em: pullEm,
          pull_lote: pullLote,
        });

        if (buffer.length >= UPSERT_BATCH) {
          await flush();
        }
      }

      // Rate limit throttle
      const throttle = res.body?.extensions?.cost?.throttleStatus;
      if (throttle) {
        const available = Number(throttle.currentlyAvailable ?? 0);
        const restore = Number(throttle.restoreRate ?? 50);
        if (available < COST_MIN_AVAILABLE && restore > 0) {
          const waitMs = Math.ceil((COST_MIN_AVAILABLE - available) / restore) * 1000;
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }

      const hasNext = !!products?.pageInfo?.hasNextPage;
      cursor = products?.pageInfo?.endCursor ?? null;
      if (!hasNext || !cursor) break;
    }

    await flush();

    const resposta = {
      pull_lote: pullLote,
      paginas,
      produtos_gravados: produtosGravados,
      variantes_totais: variantesTotais,
      ignorados,
      duracao_ms: Date.now() - inicio,
      erros,
    };

    return json(erros.length === 0 ? 200 : 500, resposta);
  } catch (e) {
    return json(500, {
      error: (e as Error).message,
      duracao_ms: Date.now() - inicio,
    });
  }
});
