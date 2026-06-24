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

    const { data: sncfToken, error: vaultErr } = await sncf.rpc("get_vault_secret", {
      p_name: "FSNC_INBOUND_TOKEN",
    });
    if (vaultErr || !sncfToken) {
      return jsonResponse(500, { error: "FSNC_INBOUND_TOKEN não encontrado no Vault" });
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

    // Chamar Edge Function do FOP em lotes de 10
    const LOTE = 10;
    const fopResultados: Record<string, any> = {};

    for (let i = 0; i < pedidos.length; i += LOTE) {
      const lote = pedidos.slice(i, i + LOTE);
      const sncfIds = lote.map((p: any) => p.id);

      const fopResp = await fetch(
        `${FOP_URL}/functions/v1/buscar-order-sncf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sncf-token": sncfToken,
          },
          body: JSON.stringify({ sncf_pedido_ids: sncfIds }),
        }
      );

      if (!fopResp.ok) {
        throw new Error(`FOP buscar-order-sncf falhou: ${fopResp.status} — ${await fopResp.text()}`);
      }

      const fopData = await fopResp.json();
      for (const r of (fopData.resultados ?? [])) {
        fopResultados[r.sncf_pedido_id] = r;
      }
    }

    const resultados: Array<{ id_externo: string; status: string; erro?: string }> = [];
    let processados = 0;
    let erros = 0;

    for (const pedido of pedidos) {
      try {
        const fopDados = fopResultados[pedido.id];

        if (!fopDados) {
          throw new Error(`Pedido não retornado pelo FOP: ${pedido.id}`);
        }
        if (fopDados.erro) {
          throw new Error(fopDados.erro);
        }

        const commercial = (fopDados.commercial as any) ?? {};

        const itensJson = (fopDados.items ?? []).map((it: any) => ({
          sku:            it.sku,
          quantidade:     it.quantity,
          preco_unitario: it.preco_unit_atacado,
          subtotal:       it.subtotal_bruto,
          produto:        it.product_snapshot,
        }));

        const snapshotNovo = {
          valor_bruto:            fopDados.valor_bruto ?? 0,
          valor_liquido:          fopDados.valor_liquido ?? 0,
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
