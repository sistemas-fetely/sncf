import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

function int(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? 0 : n;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Helpers null-safe para as tabelas-espelho (NULL quando ausente, nao zero)
function numN(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseFloat(String(v));
  return isNaN(n) ? null : n;
}

function intN(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function boolN(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

function jsonN(v: unknown): unknown {
  return v === undefined ? null : v;
}

function normalizarPagamento(raw: string | null): string | null {
  if (!raw) return null;
  const temPix = /pix/i.test(raw);
  const temCartoes = /cart[oõ]es|cartao|cartão/i.test(raw);
  const temCheckoutPro = /checkout pro/i.test(raw);
  if (temPix && !temCartoes) return "pix";
  if (temCartoes && !temPix) return "cartao";
  if ((temPix && temCartoes) || temCheckoutPro) return "misto";
  return null;
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function timingEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function hmacBase64(raw: string, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  let bin = "";
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function registrarLog(supabase: any, row: Record<string, unknown>) {
  try {
    await supabase.from("shopify_webhook_log").insert(row);
  } catch (_) {
    // auditoria nunca pode quebrar a resposta
  }
}

// ===== Processadores das tabelas-espelho (best-effort: erro loga e responde 2xx) =====
// O dado ja esta no raw antes daqui; falha de estruturacao nao deve disparar reenvio/delecao.

async function processarCheckout(supabase: any, c: any, topic: string, eventId: string | null) {
  const token = str(c.token);
  if (!token) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_token" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    token,
    cart_token: str(c.cart_token),
    name: str(c.name),
    email: str(c.email),
    phone: str(c.phone),
    currency: str(c.currency),
    presentment_currency: str(c.presentment_currency),
    subtotal_price: numN(c.subtotal_price),
    total_price: numN(c.total_price),
    total_tax: numN(c.total_tax),
    total_discounts: numN(c.total_discounts),
    total_line_items_price: numN(c.total_line_items_price),
    total_duties: numN(c.total_duties),
    total_weight: numN(c.total_weight),
    taxes_included: boolN(c.taxes_included),
    gateway: str(c.gateway),
    source: str(c.source),
    source_name: str(c.source_name),
    source_identifier: str(c.source_identifier),
    source_url: str(c.source_url),
    landing_site: str(c.landing_site),
    referring_site: str(c.referring_site),
    buyer_accepts_marketing: boolN(c.buyer_accepts_marketing),
    buyer_accepts_sms_marketing: boolN(c.buyer_accepts_sms_marketing),
    sms_marketing_phone: str(c.sms_marketing_phone),
    customer_locale: str(c.customer_locale),
    device_id: str(c.device_id),
    location_id: str(c.location_id),
    user_id: str(c.user_id),
    note: str(c.note),
    abandoned_checkout_url: str(c.abandoned_checkout_url),
    reservation_token: str(c.reservation_token),
    completed_at: iso(c.completed_at),
    closed_at: iso(c.closed_at),
    created_at_shopify: iso(c.created_at),
    updated_at_shopify: iso(c.updated_at),
    customer: jsonN(c.customer),
    billing_address: jsonN(c.billing_address),
    shipping_address: jsonN(c.shipping_address),
    line_items: jsonN(c.line_items),
    shipping_lines: jsonN(c.shipping_lines),
    discount_codes: jsonN(c.discount_codes),
    tax_lines: jsonN(c.tax_lines),
    note_attributes: jsonN(c.note_attributes),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_checkouts").upsert(row, { onConflict: "token" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_checkout", detalhe: { token, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "checkout", token } });
  return jsonResponse(200, { ok: true, topic, token });
}

async function processarProduto(supabase: any, p: any, topic: string, eventId: string | null) {
  const shopify_id = str(p.id);
  if (!shopify_id) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_id" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    shopify_id,
    admin_graphql_api_id: str(p.admin_graphql_api_id),
    title: str(p.title),
    handle: str(p.handle),
    body_html: str(p.body_html),
    product_type: str(p.product_type),
    vendor: str(p.vendor),
    status: str(p.status),
    template_suffix: str(p.template_suffix),
    published_scope: str(p.published_scope),
    has_variants_that_requires_components: boolN(p.has_variants_that_requires_components),
    published_at: iso(p.published_at),
    created_at_shopify: iso(p.created_at),
    updated_at_shopify: iso(p.updated_at),
    category: jsonN(p.category),
    variants: jsonN(p.variants),
    options: jsonN(p.options),
    image: jsonN(p.image),
    images: jsonN(p.images),
    media: jsonN(p.media),
    tags: jsonN(p.tags),
    variant_gids: jsonN(p.variant_gids),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_produtos").upsert(row, { onConflict: "shopify_id" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_produto", detalhe: { shopify_id, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "produto", shopify_id } });
  return jsonResponse(200, { ok: true, topic, shopify_id });
}

async function processarCliente(supabase: any, cu: any, topic: string, eventId: string | null) {
  const shopify_id = str(cu.id);
  if (!shopify_id) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_id" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    shopify_id,
    admin_graphql_api_id: str(cu.admin_graphql_api_id),
    email: str(cu.email),
    first_name: str(cu.first_name),
    last_name: str(cu.last_name),
    phone: str(cu.phone),
    currency: str(cu.currency),
    state: str(cu.state),
    note: str(cu.note),
    verified_email: boolN(cu.verified_email),
    tax_exempt: boolN(cu.tax_exempt),
    multipass_identifier: str(cu.multipass_identifier),
    created_at_shopify: iso(cu.created_at),
    updated_at_shopify: iso(cu.updated_at),
    addresses: jsonN(cu.addresses),
    default_address: jsonN(cu.default_address),
    tax_exemptions: jsonN(cu.tax_exemptions),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_clientes").upsert(row, { onConflict: "shopify_id" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_cliente", detalhe: { shopify_id, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "cliente", shopify_id } });
  return jsonResponse(200, { ok: true, topic, shopify_id });
}

async function processarReembolso(supabase: any, rf: any, topic: string, eventId: string | null) {
  const shopify_id = str(rf.id);
  if (!shopify_id) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_id" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    shopify_id,
    admin_graphql_api_id: str(rf.admin_graphql_api_id),
    order_id: str(rf.order_id),
    note: str(rf.note),
    restock: boolN(rf.restock),
    user_id: str(rf.user_id),
    processed_at: iso(rf.processed_at),
    created_at_shopify: iso(rf.created_at),
    refund_line_items: jsonN(rf.refund_line_items),
    refund_shipping_lines: jsonN(rf.refund_shipping_lines),
    transactions: jsonN(rf.transactions),
    order_adjustments: jsonN(rf.order_adjustments),
    duties: jsonN(rf.duties),
    additional_fees: jsonN(rf.additional_fees),
    return: jsonN(rf.return),
    total_duties_set: jsonN(rf.total_duties_set),
    total_additional_fees_set: jsonN(rf.total_additional_fees_set),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_reembolsos").upsert(row, { onConflict: "shopify_id" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_reembolso", detalhe: { shopify_id, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "reembolso", shopify_id, order_id: row.order_id } });
  return jsonResponse(200, { ok: true, topic, shopify_id });
}

async function processarFulfillment(supabase: any, f: any, topic: string, eventId: string | null) {
  const shopify_id = str(f.id);
  if (!shopify_id) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_id" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    shopify_id,
    admin_graphql_api_id: str(f.admin_graphql_api_id),
    order_id: str(f.order_id),
    status: str(f.status),
    shipment_status: str(f.shipment_status),
    service: str(f.service),
    tracking_company: str(f.tracking_company),
    tracking_number: str(f.tracking_number),
    tracking_url: str(f.tracking_url),
    name: str(f.name),
    email: str(f.email),
    location_id: str(f.location_id),
    created_at_shopify: iso(f.created_at),
    updated_at_shopify: iso(f.updated_at),
    line_items: jsonN(f.line_items),
    destination: jsonN(f.destination),
    origin_address: jsonN(f.origin_address),
    receipt: jsonN(f.receipt),
    tracking_numbers: jsonN(f.tracking_numbers),
    tracking_urls: jsonN(f.tracking_urls),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_fulfillments").upsert(row, { onConflict: "shopify_id" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_fulfillment", detalhe: { shopify_id, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "fulfillment", shopify_id, order_id: row.order_id } });
  return jsonResponse(200, { ok: true, topic, shopify_id });
}

async function processarEstoque(supabase: any, e: any, topic: string, eventId: string | null) {
  const inventory_item_id = str(e.inventory_item_id);
  const location_id = str(e.location_id);
  if (!inventory_item_id || !location_id) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId, motivo: "sem_chave" } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }
  const row = {
    inventory_item_id,
    location_id,
    available: intN(e.available),
    admin_graphql_api_id: str(e.admin_graphql_api_id),
    updated_at_shopify: iso(e.updated_at),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("shopify_estoque").upsert(row, { onConflict: "inventory_item_id,location_id" });
  if (error) {
    await registrarLog(supabase, { topic, etapa: "erro_upsert_estoque", detalhe: { inventory_item_id, location_id, msg: error.message } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro_estruturacao: true });
  }
  await registrarLog(supabase, { topic, etapa: "ok", detalhe: { recurso: "estoque", inventory_item_id, location_id, available: row.available } });
  return jsonResponse(200, { ok: true, topic, inventory_item_id, location_id });
}

// ===== orders/* — fluxo estruturado (logica inalterada, movida para funcao) =====
async function processarOrder(supabase: any, order: any, topic: string, utf8ok: boolean) {
  try {
    const shopify_id = str(order.id);
    if (!shopify_id) {
      await registrarLog(supabase, { topic, etapa: "sem_id" });
      return jsonResponse(400, { error: "Pedido sem id" });
    }

    const paid_at =
      (str(order.financial_status) ?? "").toLowerCase() === "paid" ? iso(order.processed_at) : null;
    const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
    const fulfilled_at = fulfillments.length
      ? iso(fulfillments[fulfillments.length - 1].created_at)
      : null;

    let shipping_cost = 0;
    const shipSet = order.total_shipping_price_set?.shop_money?.amount;
    if (shipSet !== null && shipSet !== undefined) shipping_cost = num(shipSet);
    else if (Array.isArray(order.shipping_lines))
      shipping_cost = order.shipping_lines.reduce((s: number, l: any) => s + num(l.price), 0);

    let refunded_amount = 0;
    if (Array.isArray(order.refunds)) {
      for (const r of order.refunds) {
        if (Array.isArray(r.transactions)) {
          for (const t of r.transactions) {
            if (t.kind === "refund" && t.status === "success") refunded_amount += num(t.amount);
          }
        }
      }
    }

    const paymentRaw =
      Array.isArray(order.payment_gateway_names) && order.payment_gateway_names.length
        ? order.payment_gateway_names.join(", ")
        : str(order.gateway);

    const addr = order.shipping_address ?? {};
    const shipLine =
      Array.isArray(order.shipping_lines) && order.shipping_lines.length ? order.shipping_lines[0] : null;

    const pedido = {
      shopify_id,
      order_name: str(order.name) ?? "",
      financial_status: (str(order.financial_status) ?? "pending").toLowerCase(),
      fulfillment_status: (str(order.fulfillment_status) ?? "unfulfilled").toLowerCase(),
      created_at_shopify: iso(order.created_at) ?? new Date().toISOString(),
      paid_at,
      fulfilled_at,
      cancelled_at: iso(order.cancelled_at),
      total: num(order.total_price),
      subtotal: num(order.subtotal_price),
      shipping_cost,
      discount_amount: num(order.total_discounts),
      refunded_amount,
      payment_method_raw: paymentRaw,
      payment_method: normalizarPagamento(paymentRaw),
      shipping_method: shipLine ? str(shipLine.title) : null,
      shipping_city: str(addr.city),
      shipping_province: str(addr.province),
      shipping_zip: str(addr.zip),
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await supabase
      .from("shopify_pedidos")
      .upsert(pedido, { onConflict: "shopify_id" });
    if (upErr) {
      await registrarLog(supabase, { topic, etapa: "erro_upsert_pedido", shopify_id, detalhe: { msg: upErr.message } });
      return jsonResponse(500, { error: `Falha upsert pedido: ${upErr.message}` });
    }

    const { error: delErr } = await supabase.from("shopify_itens").delete().eq("pedido_id", shopify_id);
    if (delErr) {
      await registrarLog(supabase, { topic, etapa: "erro_delete_itens", shopify_id, detalhe: { msg: delErr.message } });
      return jsonResponse(500, { error: `Falha limpar itens: ${delErr.message}` });
    }

    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    const itens: Array<Record<string, unknown>> = [];
    for (const li of lineItems) {
      const sku = str(li.sku);
      const nome = str(li.name) ?? str(li.title);
      if (!sku && !nome) continue;
      itens.push({
        pedido_id: shopify_id,
        sku,
        product_name: nome,
        quantity: int(li.quantity),
        unit_price: num(li.price),
        fulfillment_status: str(li.fulfillment_status),
      });
    }
    if (itens.length) {
      const { error: insErr } = await supabase.from("shopify_itens").insert(itens);
      if (insErr) {
        await registrarLog(supabase, { topic, etapa: "erro_insert_itens", shopify_id, detalhe: { msg: insErr.message } });
        return jsonResponse(500, { error: `Falha gravar itens: ${insErr.message}` });
      }
    }

    await registrarLog(supabase, {
      topic,
      etapa: "ok",
      shopify_id,
      detalhe: { metodo_match: utf8ok ? "utf8" : "hex", itens: itens.length, order_name: pedido.order_name },
    });
    return jsonResponse(200, { ok: true, topic, shopify_id, itens: itens.length });
  } catch (e) {
    await registrarLog(supabase, { topic, etapa: "erro", detalhe: { msg: String((e as any)?.message ?? e) } });
    return jsonResponse(500, { error: String((e as any)?.message ?? e) });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Use POST." });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const raw = await req.text();
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  const topic = req.headers.get("X-Shopify-Topic") ?? "desconhecido";
  const eventId = req.headers.get("X-Shopify-Event-Id");

  await registrarLog(supabase, {
    topic,
    etapa: "recebido",
    detalhe: { bytes: raw.length, temHmac: !!hmacHeader, eventId },
  });

  const { data: secret, error: secErr } = await supabase.rpc("get_vault_secret", {
    p_name: "SHOPIFY_WEBHOOK_SECRET",
  });
  if (secErr || !secret) {
    await registrarLog(supabase, { topic, etapa: "secret_ausente", detalhe: { err: secErr?.message ?? null } });
    return jsonResponse(500, { error: "SHOPIFY_WEBHOOK_SECRET ausente no vault" });
  }

  const enc = new TextEncoder();
  const utf8ok = hmacHeader
    ? timingEq(await hmacBase64(raw, enc.encode(secret as string)), hmacHeader)
    : false;
  const hexBytes = hexToBytes(secret as string);
  const hexok = hmacHeader && hexBytes
    ? timingEq(await hmacBase64(raw, hexBytes), hmacHeader)
    : false;
  if (!(utf8ok || hexok)) {
    await registrarLog(supabase, {
      topic,
      etapa: "hmac_invalido",
      detalhe: { utf8ok, hexok, headerPrefix: hmacHeader?.slice(0, 12) ?? null },
    });
    return jsonResponse(401, { error: "Assinatura HMAC inválida" });
  }

  let evento: any;
  try {
    evento = JSON.parse(raw);
  } catch {
    await registrarLog(supabase, { topic, etapa: "json_malformado" });
    return jsonResponse(400, { error: "JSON malformado" });
  }

  // POUSO RAW + DEDUP por event_id
  let duplicado = false;
  try {
    const ins = await supabase.from("shopify_eventos_raw").insert({ event_id: eventId, topic, payload: evento });
    if (ins.error) {
      if (ins.error.code === "23505") duplicado = true;
      else await registrarLog(supabase, { topic, etapa: "erro_raw", detalhe: { msg: ins.error.message } });
    }
  } catch (_) {
    // pouso raw nunca bloqueia o processamento
  }

  if (duplicado) {
    await registrarLog(supabase, { topic, etapa: "duplicado", detalhe: { eventId } });
    return jsonResponse(200, { ok: true, duplicado: true });
  }

  // ROTEAMENTO por recurso. O dado ja esta no raw; estruturacao e best-effort.
  try {
    if (topic.startsWith("orders/")) return await processarOrder(supabase, evento, topic, utf8ok);
    if (topic.startsWith("checkouts/")) return await processarCheckout(supabase, evento, topic, eventId);
    if (topic.startsWith("products/")) return await processarProduto(supabase, evento, topic, eventId);
    if (topic.startsWith("customers/")) return await processarCliente(supabase, evento, topic, eventId);
    if (topic.startsWith("refunds/")) return await processarReembolso(supabase, evento, topic, eventId);
    if (topic.startsWith("fulfillments/")) return await processarFulfillment(supabase, evento, topic, eventId);
    if (topic.startsWith("inventory_levels/")) return await processarEstoque(supabase, evento, topic, eventId);

    // qualquer outro topic: fica so no raw
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  } catch (e) {
    // rede de seguranca: dado ja salvo no raw, responde 2xx para nao disparar reenvio/delecao
    await registrarLog(supabase, { topic, etapa: "erro", detalhe: { msg: String((e as any)?.message ?? e) } });
    return jsonResponse(200, { ok: true, raw_salvo: true, erro: String((e as any)?.message ?? e) });
  }
});