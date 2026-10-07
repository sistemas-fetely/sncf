// Cadastro de UM produto no XPM/ZenLOG (J4 da Jornada do Produto Nacional).
// A RPC fn_xpm_payload_cadastro decide e monta o payload — aqui só se envia.
// Mesmo cliente/base/auth do ramo cadastrar_api de gerar-planilha-xpm
// (integracoes_config zenlog_prd + PAT via get_vault_secret).
// Sucesso é lido no CORPO da resposta (result.id), nunca só no status HTTP.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let sku = "";
  const log = async (status: string, detalhes: Record<string, unknown>) => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "zenlog_prd", tipo: "cadastro_xpm", status,
      registros_criados: status === "sucesso" ? 1 : 0, registros_erro: status === "sucesso" ? 0 : 1,
      duracao_ms: Date.now() - t0, detalhes: { acao: "cadastrar-produto-xpm", sku, ...detalhes },
    });
    if (error) console.error("[cadastrar-produto-xpm] log:", error.message);
  };

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
    const { data: ud, error: eUser } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (eUser || !ud?.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
    const userId = ud.user.id;

    const { data: pode, error: ePode } = await supabase.rpc("usuario_tem_acao", { p_slug: "acao.cadastrar_produto_xpm", p_user_id: userId });
    if (ePode) return json({ ok: false, erro: `usuario_tem_acao: ${ePode.message}` }, 500);
    let permitido = !!pode;
    if (!permitido) {
      const { data: ehSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
      permitido = !!ehSuper;
    }
    if (!permitido) return json({ ok: false, erro: "Sem permissão para esta ação (acao.cadastrar_produto_xpm)." }, 403);

    const body = await req.json().catch(() => null);
    sku = typeof body?.sku === "string" ? body.sku.trim() : "";
    if (!sku || sku.length > 60) return json({ ok: false, erro: "sku obrigatório (texto até 60 caracteres)." }, 400);

    const { data: pay, error: ePay } = await supabase.rpc("fn_xpm_payload_cadastro", { p_sku: sku });
    if (ePay) return json({ ok: false, erro: `fn_xpm_payload_cadastro: ${ePay.message}` }, 400);
    const pv = pay as any;
    if (pv?.pode_enviar !== true) return json({ ok: false, erro: "bloqueado", bloqueios: pv?.bloqueios ?? [] }, 400);
    if (!pv?.passo_1_produto || !pv?.passo_2_produto_sku) {
      return json({ ok: false, erro: "payload da RPC sem passo_1_produto/passo_2_produto_sku", payload: pv }, 500);
    }

    const { data: cfgRow, error: eCfg } = await supabase
      .from("integracoes_config").select("config").eq("sistema", "zenlog_prd").single();
    if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
    const cfg = (cfgRow!.config ?? {}) as Record<string, string>;
    if (!cfg.base_url) throw new Error("base_url ausente na config zenlog_prd");
    const { data: pat, error: ePat } = await supabase.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
    if (ePat) throw new Error(`vault: ${ePat.message}`);
    if (!pat) throw new Error("PAT ausente no vault");
    const base = cfg.base_url;
    const authRes = await fetch(`${base}${cfg.auth_endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
    });
    const authJson = await authRes.json().catch(() => ({}));
    const token = authJson?.result?.accessToken;
    if (!authRes.ok || !token) throw new Error(`auth XPM falhou: ${authJson?.error?.message ?? authRes.status}`);
    const hJson = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

    // Passo 1 — Produto/Create
    const r1 = await fetch(`${base}/api/services/app/Produto/Create`, {
      method: "POST", headers: hJson, body: JSON.stringify(pv.passo_1_produto),
    });
    const t1 = await r1.text();
    let j1: any = null; try { j1 = JSON.parse(t1); } catch { /* corpo não-JSON */ }
    const produtoId = j1?.result?.id;
    if (!r1.ok || j1?.success !== true || !produtoId) {
      await log("erro", { passo: 1, http: r1.status, corpo: j1 ?? t1 });
      return json({ ok: false, erro: "XPM recusou o Produto/Create", passo: 1, http: r1.status, corpo: j1 ?? t1 }, 502);
    }

    // Trava imediata: o produto já existe no XPM — impede um segundo Produto/Create.
    const p1 = pv.passo_1_produto;
    const espelho = async (skuEan: string | null, extra: Record<string, unknown>) => {
      const { error } = await supabase.from("xpm_produtos_cache").upsert({
        xpm_produto_id: produtoId, codigo: sku, descricao: p1.descricao ?? null,
        descricao_reduzida: p1.descricaoReduzida ?? null, ncm: p1.classificacaoFiscalNCM ?? null,
        unidade_medida: p1.codigoUnidadeMedida ?? null, peso_unitario_kg: p1.pesoUnitario ?? null,
        altura_m: p1.altura ?? null, largura_m: p1.largura ?? null, comprimento_m: p1.comprimento ?? null,
        sku_ean: skuEan, origem_dado: p1.origemDeDado ?? null, depositante_cnpj: p1.cpfCnpjDepositante ?? null,
        payload: { origem: "cadastrar-produto-xpm", produto: j1?.result ?? null, ...extra },
        sincronizado_em: new Date().toISOString(),
      }, { onConflict: "xpm_produto_id" });
      if (error) throw new Error(`xpm_produtos_cache: ${error.message}`);
    };
    await espelho(null, {});

    // Passo 2 — ProdutoSKU/Create
    const r2 = await fetch(`${base}/api/services/app/ProdutoSKU/Create`, {
      method: "POST", headers: hJson, body: JSON.stringify({ ...pv.passo_2_produto_sku, produtoId }),
    });
    const t2 = await r2.text();
    let j2: any = null; try { j2 = JSON.parse(t2); } catch { /* corpo não-JSON */ }
    const skuId = j2?.result?.id;
    if (!r2.ok || j2?.success !== true || !skuId) {
      await log("erro", { passo: 2, xpm_produto_id: produtoId, http: r2.status, corpo: j2 ?? t2 });
      return json({
        ok: false, erro: "PRODUTO_SEM_SKU: produto criado no XPM, mas o ProdutoSKU/Create falhou",
        passo: 2, xpm_produto_id: produtoId, http: r2.status, corpo: j2 ?? t2,
        acao: "retomar apenas ProdutoSKU/Create com este produtoId — NAO repetir o Produto/Create",
      }, 502);
    }

    await espelho(pv.passo_2_produto_sku.codigo ?? null, { sku: j2?.result ?? null });
    await log("sucesso", { xpm_produto_id: produtoId, xpm_sku_id: skuId, aviso_corte: pv.aviso_corte ?? null });
    return json({ ok: true, sku, xpm_produto_id: produtoId, xpm_sku_id: skuId, aviso_corte: pv.aviso_corte ?? null });
  } catch (e) {
    const msg = (e as Error).message;
    await log("erro", { erro: msg });
    return json({ ok: false, erro: msg }, 500);
  }
});
