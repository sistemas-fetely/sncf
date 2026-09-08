// zenlog-sync-produtos — espelha o cadastro de item do XPM em xpm_produtos_cache.
// SOMENTE GET: a doutrina em integracoes_config.doutrina exige OK explicito
// nomeando o caso para qualquer POST/PUT no XPM. Aqui nao se cria produto.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// xpm_envios_log.pedido_id e NOT NULL e nao se aplica a um sync de cadastro:
// sentinela fixa marcando "nao ha pedido", em vez de criar coluna nova.
const SEM_PEDIDO = "00000000-0000-0000-0000-000000000000";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const t0 = Date.now();
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let paginas = 0;
  let itens = 0;
  let total_no_xpm = 0;

  try {
    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "zenlog_prd")
      .single();
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    const cfg = cfgRow!.config as Record<string, string>;

    if (!cfg.base_url) throw new Error("base_url ausente na config zenlog_prd");

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;

    const authRes = await fetch(`${base}/api/TokenAuth/AuthenticatePAT`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const authJson = await authRes.json().catch(() => ({}));
    const token = authJson?.result?.accessToken;
    if (!authRes.ok || !token) {
      throw new Error(`auth falhou: ${authJson?.error?.message ?? authRes.status}`);
    }
    const headers = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const take = 350;
    const maxPaginas = 10;
    let skip = 0;
    let total = Infinity;
    const acumulado: Record<string, any>[] = [];

    while (skip < total && paginas < maxPaginas) {
      const url = `${base}/api/services/app/Produto/GetAll?MaxResultCount=${take}&SkipCount=${skip}`;
      const r = await fetch(url, { headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(`Produto/GetAll SkipCount=${skip}: ${j?.error?.message ?? r.status}`);
      }

      total = j?.result?.totalCount ?? 0;
      const items = j?.result?.items ?? [];
      if (items.length === 0) break;

      for (const item of items) {
        acumulado.push({
          xpm_produto_id: item.id,
          codigo: item.codigo?.trim(),
          descricao: item.descricao ?? null,
          descricao_reduzida: item.descricaoReduzida ?? null,
          ncm: item.classificacaoFiscalNCM ?? null,
          unidade_medida: item.unidadeMedida?.codigo ?? null,
          categoria_codigo: item.categoria?.codigo ?? null,
          categoria_descricao: item.categoria?.descricao ?? null,
          peso_unitario_kg: num(item.pesoUnitario),
          altura_m: num(item.altura),
          largura_m: num(item.largura),
          comprimento_m: num(item.comprimento),
          sku_ean: item.produtoSKU?.codigo ?? null,
          peso_bruto_kg: num(item.produtoSKU?.pesoBruto),
          qtd_item_sku: num(item.produtoSKU?.qtdItemSKU),
          camada: num(item.produtoSKU?.camada),
          lastro: num(item.produtoSKU?.lastro),
          controla_lote: item.controlaLote ?? null,
          controla_validade: item.controlaValidade ?? null,
          controla_serie: item.controlaSerie ?? null,
          origem_dado: item.origemDeDado ?? null,
          depositante_cnpj: item.depositante?.cpfCnpj ?? null,
          payload: item,
          sincronizado_em: new Date().toISOString(),
        });
      }

      skip += items.length;
      paginas++;
    }

    total_no_xpm = total;

    if (acumulado.length > 0) {
      for (let i = 0; i < acumulado.length; i += 350) {
        const fatia = acumulado.slice(i, i + 350);
        const { error: eUp } = await sb
          .from("xpm_produtos_cache")
          .upsert(fatia, { onConflict: "xpm_produto_id", ignoreDuplicates: false });
        if (eUp) throw new Error(`upsert xpm_produtos_cache: ${eUp.message}`);
      }
      itens = acumulado.length;
    }

    await sb.from("xpm_envios_log").insert({
      pedido_id: SEM_PEDIDO,
      operacao: "sync_produtos",
      payload_enviado: { endpoint: "Produto/GetAll", max_result_count: 350, max_paginas: 10 },
      resposta_status: 200,
      resposta_body: { paginas, itens, total_no_xpm },
      sucesso: true,
      duracao_ms: Date.now() - t0,
    });

    return new Response(JSON.stringify({ ok: true, paginas, itens, total_no_xpm }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("xpm_envios_log").insert({
      pedido_id: SEM_PEDIDO,
      operacao: "sync_produtos",
      payload_enviado: { endpoint: "Produto/GetAll", max_result_count: 350, max_paginas: 10 },
      resposta_status: 500,
      resposta_body: { paginas, itens_antes_do_erro: itens, total_no_xpm },
      sucesso: false,
      erro_msg: msg,
      duracao_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
