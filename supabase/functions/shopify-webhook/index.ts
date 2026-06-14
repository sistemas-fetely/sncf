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

  // ROTEAMENTO: por enquanto só orders/* é estruturado; o resto fica no raw.
  if (!topic.startsWith("orders/")) {
    await registrarLog(supabase, { topic, etapa: "ok_raw", detalhe: { eventId } });
    return jsonResponse(200, { ok: true, somente_raw: true, topic });
  }

  // ===== orders/* — fluxo estruturado (inalterado) =====
  const order = evento;
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
});