import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;

    const authRes = await fetch(`${base}/api/TokenAuth/AuthenticatePAT`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const authJson = await authRes.json();
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
      const j = await r.json();
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
          peso_unitario_kg: item.pesoUnitario ?? null,
          altura_m: item.altura ?? null,
          largura_m: item.largura ?? null,
          comprimento_m: item.comprimento ?? null,
          sku_ean: item.produtoSKU?.codigo ?? null,
          peso_bruto_kg: item.produtoSKU?.pesoBruto ?? null,
          qtd_item_sku: item.produtoSKU?.qtdItemSKU ?? null,
          camada: item.produtoSKU?.camada ?? null,
          lastro: item.produtoSKU?.lastro ?? null,
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
      pedido_identificador: null,
      operacao: "sync_produtos",
      status: "sucesso",
      payload: { paginas, itens, total_no_xpm },
      criado_em: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, paginas, itens, total_no_xpm }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("xpm_envios_log").insert({
      pedido_identificador: null,
      operacao: "sync_produtos",
      status: "erro",
      payload: { erro: msg, paginas_antes_do_erro: paginas, itens_antes_do_erro: itens },
      criado_em: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: false, erro: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
