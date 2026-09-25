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
      hasVariantsThatRequiresComponents
      variants(first: 100) {
        pageInfo { hasNextPage endCursor }
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

// Produto com mais de 100 variantes: busca o restante paginando no próprio produto.
// Sem isso o espelho perde variantes (caso real: velas numéricas, 25/09/2026).
const VARIANTS_QUERY = `
query($id: ID!, $cursor: String) {
  product(id: $id) {
    variants(first: 250, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id sku barcode price compareAtPrice position title
        inventoryPolicy
        selectedOptions { name value }
        inventoryItem { id }
        inventoryQuantity
      }
    }
  }
}`;
const MAX_VARIANT_PAGES = 20; // 20 x 250 = 5.000 variantes por produto (teto do Shopify é 2.048)

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

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const reconciliar = body?.reconciliar_excluidos === true;
  const listarWebhooks = body?.listar_webhooks === true;
  const criarWebhookDelete = body?.criar_webhook_delete === true;
  const espelhar = body?.espelhar === true;
  const dryRun = body?.dry_run !== false;
  // Guarda da reconciliacao: percentual maximo de ausentes aceito (default 30, teto 60).
  const limiteRaw = Number(body?.limite_percentual);
  const limitePercentual = Number.isFinite(limiteRaw) && limiteRaw > 0 ? Math.min(limiteRaw, 60) : 30;

  try {
    const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
    const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
    if (!clientId || !clientSecret) throw new Error("SHOPIFY_CLIENT_ID/SECRET ausentes no vault");

    const domain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
    if (!domain) throw new Error("SHOPIFY_STORE_DOMAIN ausente no vault — pull abortado (nao ha fallback seguro)");

    const token = await exchangeToken(domain, clientId, clientSecret);
    if (!token) throw new Error(`falha ao autenticar em ${domain} via client_credentials`);

    if (listarWebhooks) {
      const r = await gqlWithRetry(domain, token, `{ webhookSubscriptions(first: 50) { nodes { topic uri } } }`, {});
      if (r.status !== 200 || r.body?.errors) {
        throw new Error(`webhookSubscriptions falhou: status=${r.status} errors=${JSON.stringify(r.body?.errors ?? r.body).slice(0, 500)}`);
      }
      const nodes = r.body?.data?.webhookSubscriptions?.nodes ?? [];
      return json(200, {
        total: nodes.length,
        products_delete_assinado: nodes.some((n: any) => n?.topic === "PRODUCTS_DELETE"),
        webhooks: nodes,
      });
    }

    if (criarWebhookDelete) {
      // So cria se ainda nao houver assinatura PRODUCTS_DELETE.
      const r = await gqlWithRetry(domain, token, `{ webhookSubscriptions(first: 50) { nodes { topic uri } } }`, {});
      if (r.status !== 200 || r.body?.errors) {
        throw new Error(`webhookSubscriptions falhou: status=${r.status} errors=${JSON.stringify(r.body?.errors ?? r.body).slice(0, 500)}`);
      }
      const nodes = r.body?.data?.webhookSubscriptions?.nodes ?? [];
      const existente = nodes.find((n: any) => n?.topic === "PRODUCTS_DELETE");
      if (existente) {
        return json(200, { criado: false, motivo: "PRODUCTS_DELETE ja assinado", webhook: existente });
      }
      const key = `products-delete-${crypto.randomUUID()}`;
      const MUTATION = `mutation criarWebhookDelete($key: String!) {
        webhookSubscriptionCreate(topic: PRODUCTS_DELETE, webhookSubscription: { uri: "https://vaxzorhqzvsnkutrlvfr.supabase.co/functions/v1/shopify-webhook", format: JSON }) @idempotent(key: $key) {
          webhookSubscription { id topic uri }
          userErrors { field message }
        }
      }`;
      const c = await gqlWithRetry(domain, token, MUTATION, { key });
      const payload = c.body?.data?.webhookSubscriptionCreate;
      const userErrors = payload?.userErrors ?? [];
      if (c.status !== 200 || c.body?.errors || userErrors.length > 0) {
        throw new Error(`webhookSubscriptionCreate falhou: status=${c.status} errors=${JSON.stringify(c.body?.errors ?? [])} userErrors=${JSON.stringify(userErrors)}`);
      }
      return json(200, { criado: true, webhook: payload?.webhookSubscription ?? null });
    }

    const vistos = new Set<string>();

    const pullLote = crypto.randomUUID();
    const pullEm = new Date().toISOString();

    let cursor: string | null = null;
    let paginas = 0;
    let ignorados = 0;
    let variantesTotais = 0;
    let produtosGravados = 0;
    const erros: any[] = [];

    let buffer: any[] = [];
    const espelhoRows: any[] = [];

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
        vistos.add(shopifyId);

        let variantNodes: any[] = p?.variants?.nodes ?? [];
        // FAIL-LOUD: se não conseguir completar as variantes, aborta o pull (espelho incompleto é pior que pull falho).
        let vPage = p?.variants?.pageInfo;
        let vPaginas = 0;
        while (vPage?.hasNextPage) {
          if (vPaginas >= MAX_VARIANT_PAGES) {
            throw new Error(`produto ${p?.id}: mais de ${MAX_VARIANT_PAGES} paginas de variantes — abortado`);
          }
          const rv = await gqlWithRetry(domain, token, VARIANTS_QUERY, { id: p.id, cursor: vPage.endCursor });
          if (rv.status !== 200 || rv.body?.errors) {
            throw new Error(`variantes de ${p?.id} falharam: status=${rv.status} errors=${JSON.stringify(rv.body?.errors ?? rv.body).slice(0, 500)}`);
          }
          const vv = rv.body?.data?.product?.variants;
          variantNodes = variantNodes.concat(vv?.nodes ?? []);
          vPage = vv?.pageInfo;
          vPaginas++;
        }
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

        if (espelhar) {
          espelhoRows.push({
            shopify_id: shopifyId,
            admin_graphql_api_id: p?.id ?? null,
            title: p?.title ?? null,
            handle: p?.handle ?? null,
            status: p?.status ? String(p.status).toLowerCase() : null,
            vendor: p?.vendor ?? null,
            product_type: p?.productType ?? null,
            tags: Array.isArray(p?.tags) ? p.tags : [],
            has_variants_that_requires_components: p?.hasVariantsThatRequiresComponents === true,
            created_at_shopify: p?.createdAt ?? null,
            updated_at_shopify: p?.updatedAt ?? null,
            updated_at: new Date().toISOString(),
            variants: variantNodes.map((v: any) => ({
              id: v?.id ? Number(extrairIdNumerico(v.id)) : null,
              sku: v?.sku ?? null,
              barcode: v?.barcode ?? null,
              price: v?.price ?? null,
              title: v?.title ?? null,
              position: v?.position ?? null,
              inventory_item_id: v?.inventoryItem?.id ? Number(extrairIdNumerico(v.inventoryItem.id)) : null,
            })),
          });
        }

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

    // deno-lint-ignore no-explicit-any
    let espelhoRes: any = {};
    if (espelhar) {
      if (erros.length > 0) {
        throw new Error(`espelhamento abortado: pull teve ${erros.length} erro(s) — ${JSON.stringify(erros).slice(0, 300)}`);
      }
      const t0 = Date.now();
      const existentes = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("shopify_produtos").select("shopify_id").order("shopify_id").range(from, from + 999);
        if (error) throw new Error(`leitura shopify_produtos (espelho) falhou: ${error.message}`);
        for (const r of data ?? []) existentes.add(String(r.shopify_id));
        if (!data || data.length < 1000) break;
      }
      let espelhados = 0;
      for (let i = 0; i < espelhoRows.length; i += 50) {
        const lote = espelhoRows.slice(i, i + 50);
        const { error } = await supabase.from("shopify_produtos").upsert(lote, { onConflict: "shopify_id" });
        if (error) throw new Error(`upsert shopify_produtos falhou apos ${espelhados} espelhados: ${error.message}`);
        espelhados += lote.length;
      }
      const novos = espelhoRows.filter((r) => !existentes.has(String(r.shopify_id))).map((r) => r.shopify_id);
      espelhoRes = { espelhados, novos_no_espelho: novos.length, novos_ids: novos };
      const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
        sistema: "shopify", tipo: "catalogo_espelhar", status: "sucesso",
        registros_atualizados: espelhados, duracao_ms: Date.now() - t0,
        detalhes: JSON.stringify(espelhoRes),
      });
      if (logErr) console.error("log:", logErr.message);
    }

    if (reconciliar) {
      // So reconcilia com pull integro: qualquer erro de gravacao aborta.
      if (erros.length > 0) {
        throw new Error(`reconciliacao abortada: pull teve ${erros.length} erro(s) — ${JSON.stringify(erros).slice(0, 300)}`);
      }
      const t0 = Date.now();
      const vivos: { shopify_id: string; title: string | null; status: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("shopify_produtos")
          .select("shopify_id, title, status")
          .order("shopify_id")
          .range(from, from + 999);
        if (error) throw new Error(`leitura shopify_produtos falhou: ${error.message}`);
        for (const r of data ?? []) {
          if (r.status !== "deleted") vivos.push({ shopify_id: String(r.shopify_id), title: r.title ?? null, status: r.status ?? null });
        }
        if (!data || data.length < 1000) break;
      }
      const ausentes = vivos.filter((r) => !vistos.has(r.shopify_id));
      const percentual = vivos.length > 0 ? (ausentes.length / vivos.length) * 100 : 0;
      const acimaDoLimite = vivos.length > 0 && percentual > limitePercentual;
      if (dryRun) {
        // Visibilidade nao e bloqueada: devolve TODOS os ausentes, mesmo acima do limite.
        return json(200, {
          ...espelhoRes, dry_run: true, vistos: vistos.size, nao_excluidos: vivos.length, ausentes: ausentes.length,
          percentual: Math.round(percentual * 100) / 100, limite_percentual: limitePercentual,
          acima_do_limite: acimaDoLimite,
          exemplos: ausentes.map((a) => ({ shopify_id: a.shopify_id, title: a.title, status: a.status })),
        });
      }
      if (acimaDoLimite) {
        throw new Error(`pull suspeito: ${ausentes.length} de ${vivos.length} produtos nao-excluidos ausentes (${Math.round(percentual * 100) / 100}% > ${limitePercentual}%) — nada foi marcado`);
      }
      let marcados = 0;
      const ids = ausentes.map((a) => a.shopify_id);
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { data, error } = await supabase
          .from("shopify_produtos")
          .update({ status: "deleted", updated_at: new Date().toISOString() })
          .in("shopify_id", lote)
          .select("shopify_id");
        if (error) throw new Error(`soft delete falhou apos ${marcados} marcados: ${error.message}`);
        marcados += data?.length ?? 0;
      }
      const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
        sistema: "shopify", tipo: "catalogo_reconciliar_excluidos", status: "sucesso",
        registros_atualizados: marcados, duracao_ms: Date.now() - t0,
        detalhes: JSON.stringify({ vistos: vistos.size, marcados_excluidos: marcados, ids }),
      });
      if (logErr) console.error("log:", logErr.message);
      return json(200, { ...espelhoRes, vistos: vistos.size, marcados_excluidos: marcados });
    }

    const resposta = {
      pull_lote: pullLote,
      paginas,
      produtos_gravados: produtosGravados,
      variantes_totais: variantesTotais,
      ignorados,
      duracao_ms: Date.now() - inicio,
      erros,
      ...espelhoRes,
    };

    return json(erros.length === 0 ? 200 : 500, resposta);
  } catch (e) {
    return json(500, {
      error: (e as Error).message,
      duracao_ms: Date.now() - inicio,
    });
  }
});
