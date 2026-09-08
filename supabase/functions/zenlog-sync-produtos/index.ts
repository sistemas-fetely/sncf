// zenlog-sync-produtos — espelha o cadastro de item do XPM em xpm_produtos_cache.
// SOMENTE GET: a doutrina em integracoes_config.doutrina exige OK explicito
// nomeando o caso para qualquer POST/PUT no XPM. Aqui nao se cria produto.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// xpm_envios_log.pedido_id e NOT NULL e nao se aplica a um sync de cadastro:
// sentinela fixa marcando "nao ha pedido", em vez de criar coluna nova.
const SEM_PEDIDO = "00000000-0000-0000-0000-000000000000";
const MAX_PAGINAS = 10;
const TAKE = 350;

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
  let total = 0;

  try {
    const { data: cfgRow, error: eCfg } = await sb
      .from("integracoes_config").select("config").eq("sistema", "zenlog_prd").single();
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    const cfg = (cfgRow!.config ?? {}) as Record<string, string>;

    const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");

    const base = cfg.base_url;
    if (!base) throw new Error("base_url ausente em integracoes_config.zenlog_prd");
    const authEndpoint = cfg.auth_endpoint ?? "/api/TokenAuth/AuthenticatePAT";

    const authRes = await fetch(`${base}${authEndpoint}`, {
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

    let skip = 0;
    let restam = Infinity;

    while (skip < restam && paginas < MAX_PAGINAS) {
      const qs = new URLSearchParams({
        MaxResultCount: String(TAKE),
        SkipCount: String(skip),
      });
      const r = await fetch(`${base}/api/services/app/Produto/GetAll?${qs}`, { headers });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) {
        throw new Error(`Produto/GetAll skip=${skip}: ${j?.error?.message ?? r.status}`);
      }
      total = j?.result?.totalCount ?? 0;
      restam = total;
      const lista: Record<string, any>[] = j?.result?.items ?? [];
      paginas++;
      if (lista.length === 0) break;

      const linhas = lista
        .filter((it) => it?.id != null && it?.codigo)
        .map((it) => ({
          xpm_produto_id: it.id,
          codigo: String(it.codigo).trim(),
          descricao: it.descricao ?? null,
          descricao_reduzida: it.descricaoReduzida ?? null,
          ncm: it.classificacaoFiscalNCM ?? null,
          unidade_medida: it.unidadeMedida?.codigo ?? null,
          categoria_codigo: it.categoria?.codigo ?? null,
          categoria_descricao: it.categoria?.descricao ?? null,
          peso_unitario_kg: num(it.pesoUnitario),
          altura_m: num(it.altura),
          largura_m: num(it.largura),
          comprimento_m: num(it.comprimento),
          sku_ean: it.produtoSKU?.codigo ?? null,
          peso_bruto_kg: num(it.produtoSKU?.pesoBruto),
          qtd_item_sku: num(it.produtoSKU?.qtdItemSKU),
          camada: num(it.produtoSKU?.camada),
          lastro: num(it.produtoSKU?.lastro),
          controla_lote: it.controlaLote ?? null,
          controla_validade: it.controlaValidade ?? null,
          controla_serie: it.controlaSerie ?? null,
          origem_dado: it.origemDeDado ?? null,
          depositante_cnpj: it.depositante?.cpfCnpj ?? null,
          payload: it,
          sincronizado_em: new Date().toISOString(),
        }));

      if (linhas.length > 0) {
        const { error: eUp } = await sb
          .from("xpm_produtos_cache")
          .upsert(linhas, { onConflict: "xpm_produto_id", ignoreDuplicates: false });
        if (eUp) throw new Error(`upsert produtos skip=${skip}: ${eUp.message}`);
        itens += linhas.length;
      }
      skip += lista.length;
    }

    await sb.from("xpm_envios_log").insert({
      pedido_id: SEM_PEDIDO,
      operacao: "sync_produtos",
      payload_enviado: {
        endpoint: "Produto/GetAll",
        max_result_count: TAKE,
        max_paginas: MAX_PAGINAS,
      },
      resposta_status: 200,
      resposta_body: { paginas, itens, total_no_xpm: total },
      sucesso: true,
      duracao_ms: Date.now() - t0,
    });

    return new Response(JSON.stringify({ ok: true, paginas, itens, total_no_xpm: total }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from("xpm_envios_log").insert({
      pedido_id: SEM_PEDIDO,
      operacao: "sync_produtos",
      payload_enviado: { endpoint: "Produto/GetAll", max_paginas: MAX_PAGINAS },
      resposta_status: 500,
      resposta_body: { paginas, itens_antes_do_erro: itens, total_no_xpm: total },
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
