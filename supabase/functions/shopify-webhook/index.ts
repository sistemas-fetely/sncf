import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic",
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

// Mesma lógica do importer CSV — mantém payment_method consistente entre backfill e tempo real.
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

async function verificarHmac(raw: string, header: string | null, secret: string): Promise<boolean> {
  if (!header) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const bytes = new Uint8Array(sigBuf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const computed = btoa(bin);
  // comparação de tempo constante
  if (computed.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Use POST." });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1. Corpo CRU primeiro (HMAC é sobre os bytes exatos — não parsear antes).
  const raw = await req.text();
  const hmacHeader = req.headers.get("X-Shopify-Hmac-Sha256");
  const topic = req.headers.get("X-Shopify-Topic") ?? "desconhecido";
  console.log("[shopify-webhook] recebido", { topic, bytes: raw.length, temHmac: !!hmacHeader });

  // 2. Segredo do vault.
  const { data: secret, error: secErr } = await supabase.rpc("get_vault_secret", {
    p_name: "SHOPIFY_WEBHOOK_SECRET",
  });
  if (secErr || !secret) {
    console.error("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET ausente no vault", secErr?.message);
    return jsonResponse(500, { error: "SHOPIFY_WEBHOOK_SECRET ausente no vault" });
  }

  // 3. Verifica assinatura.
  const valido = await verificarHmac(raw, hmacHeader, secret as string);
  if (!valido) {
    console.error("[shopify-webhook] HMAC inválido", { topic, temHmac: !!hmacHeader });
    return jsonResponse(401, { error: "Assinatura HMAC inválida" });
  }

  // 4. Parse.
  let order: any;
  try {
    order = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "JSON malformado" });
  }

  try {
    const shopify_id = str(order.id);
    if (!shopify_id) return jsonResponse(400, { error: "Pedido sem id" });

    // paid_at: webhook não traz pronto — proxy = processed_at quando pago.
    const paid_at =
      (str(order.financial_status) ?? "").toLowerCase() === "paid" ? iso(order.processed_at) : null;

    // fulfilled_at: deriva do último fulfillments[].
    const fulfillments = Array.isArray(order.fulfillments) ? order.fulfillments : [];
    const fulfilled_at = fulfillments.length
      ? iso(fulfillments[fulfillments.length - 1].created_at)
      : null;

    // shipping_cost: total_shipping_price_set, com fallback nas shipping_lines.
    let shipping_cost = 0;
    const shipSet = order.total_shipping_price_set?.shop_money?.amount;
    if (shipSet !== null && shipSet !== undefined) shipping_cost = num(shipSet);
    else if (Array.isArray(order.shipping_lines))
      shipping_cost = order.shipping_lines.reduce((s: number, l: any) => s + num(l.price), 0);

    // refunded_amount: soma das transações de refund bem-sucedidas (best-effort).
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
      Array.isArray(order.shipping_lines) && order.shipping_lines.length
        ? order.shipping_lines[0]
        : null;

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

    // UPSERT pedido (não toca wns_pedido_id nem importacao_id — colunas fora do payload).
    const { error: upErr } = await supabase
      .from("shopify_pedidos")
      .upsert(pedido, { onConflict: "shopify_id" });
    if (upErr) return jsonResponse(500, { error: `Falha upsert pedido: ${upErr.message}` });

    // Itens: DELETE + INSERT (mesmo padrão do CSV).
    const { error: delErr } = await supabase
      .from("shopify_itens")
      .delete()
      .eq("pedido_id", shopify_id);
    if (delErr) return jsonResponse(500, { error: `Falha limpar itens: ${delErr.message}` });

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
      if (insErr) return jsonResponse(500, { error: `Falha gravar itens: ${insErr.message}` });
    }

    console.log("[shopify-webhook] OK", { topic, shopify_id, order_name: pedido.order_name, itens: itens.length });
    return jsonResponse(200, { ok: true, topic, shopify_id, itens: itens.length });
  } catch (e) {
    console.error("[shopify-webhook] erro inesperado", e);
    return jsonResponse(500, { error: String((e as any)?.message ?? e) });
  }
});
