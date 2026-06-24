import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido. Use POST." });
  }

  const sncfUrl        = Deno.env.get("SUPABASE_URL")!;
  const sncfServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sncf           = createClient(sncfUrl, sncfServiceKey);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Authorization obrigatório" });

    const { data: fopKey, error: vaultErr } = await sncf.rpc("get_vault_secret", {
      p_name: "FOP_SERVICE_ROLE_KEY",
    });
    if (vaultErr || !fopKey) {
      return jsonResponse(500, { error: "FOP_SERVICE_ROLE_KEY não encontrado no Vault" });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* sem body = rodar tudo */ }

    const pedidoIdsFiltro: string[] | null = body?.pedido_ids ?? null;

    let query = sncf
      .from("pedidos")
      .select("id, id_externo, snapshot_original")
      .not("id_externo", "is", null);

    if (pedidoIdsFiltro && pedidoIdsFiltro.length > 0) {
      query = query.in("id", pedidoIdsFiltro);
    } else {
      query = query.contains("snapshot_original", { backfill: true });
    }

    const { data: pedidos, error: pedidosErr } = await query;
    if (pedidosErr) throw pedidosErr;
    if (!pedidos || pedidos.length === 0) {
      return jsonResponse(200, { ok: true, processados: 0, erros: 0, mensagem: "Nenhum pedido para processar" });
    }

    const resultados: Array<{ id_externo: string; status: string; erro?: string }> = [];
    let processados = 0;
    let erros = 0;

    for (const pedido of pedidos) {
      try {
        const orderResp = await fetch(
          `${FOP_URL}/rest/v1/orders?select=id,valor_bruto,valor_liquido,commercial&sncf_pedido_id=eq.${pedido.id}`,
          {
            headers: {
              apikey: fopKey,
              Authorization: `Bearer ${fopKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (!orderResp.ok) {
          throw new Error(`FOP orders fetch falhou: ${orderResp.status} — ${await orderResp.text()}`);
        }
        const orders = await orderResp.json();
        if (!orders || orders.length === 0) {
          throw new Error(`Order não encontrada no FOP para sncf_pedido_id=${pedido.id}`);
        }
        const order = orders[0];
        const commercial = (order.commercial as any) ?? {};

        const itemsResp = await fetch(
          `${FOP_URL}/rest/v1/order_items?select=sku,quantity,preco_unit_atacado,subtotal_bruto,product_snapshot&order_id=eq.${order.id}&order=posicao.asc`,
          {
            headers: {
              apikey: fopKey,
              Authorization: `Bearer ${fopKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (!itemsResp.ok) {
          throw new Error(`FOP order_items fetch falhou: ${itemsResp.status}`);
        }
        const items = await itemsResp.json();

        const itensJson = (items ?? []).map((it: any) => ({
          sku:            it.sku,
          quantidade:     it.quantity,
          preco_unitario: it.preco_unit_atacado,
          subtotal:       it.subtotal_bruto,
          produto:        it.product_snapshot,
        }));

        const snapshotNovo = {
          valor_bruto:            order.valor_bruto ?? 0,
          valor_liquido:          order.valor_liquido ?? 0,
          valor_frete:            commercial?.freteValor            ?? 0,
          frete_tipo:             commercial?.frete                 ?? null,
          desconto_celebra_valor: commercial?.descontoCelebraValor  ?? 0,
          bonus_pix_valor:        commercial?.bonusPixValor         ?? 0,
          itens_json:             itensJson,
          gravado_em:             new Date().toISOString(),
          backfill:               false,
          rebackfill_em:          new Date().toISOString(),
        };

        const { error: updateErr } = await sncf
          .from("pedidos")
          .update({ snapshot_original: snapshotNovo })
          .eq("id", pedido.id);

        if (updateErr) throw updateErr;

        resultados.push({ id_externo: pedido.id_externo, status: "ok" });
        processados++;

      } catch (err: any) {
        resultados.push({
          id_externo: pedido.id_externo,
          status: "erro",
          erro: err?.message ?? "Erro desconhecido",
        });
        erros++;
      }
    }

    return jsonResponse(200, {
      ok:           erros === 0,
      processados,
      erros,
      resultados,
    });

  } catch (err: any) {
    return jsonResponse(500, { error: err?.message ?? "Erro interno" });
  }
});
