import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const jsonErr = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Gera planilha com itens de pedido — exige sessão e permissão de Logística (achado crítico 23/08/2026).
    const auth = req.headers.get("Authorization");
    if (!auth) return jsonErr({ error: "Não autorizado: token ausente." }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData?.user) return jsonErr({ error: "Não autorizado: sessão inválida." }, 401);
    const { data: telas } = await supabase.rpc("usuario_telas_permitidas", { p_user_id: userData.user.id });
    let permitido = Array.isArray(telas) && telas.some((t: any) =>
      typeof t === "string" ? t === "tela.logistica" : t?.slug === "tela.logistica");
    if (!permitido) {
      const { data: ehSuper } = await supabase.rpc("has_role", { _user_id: userData.user.id, _role: "super_admin" });
      permitido = !!ehSuper;
    }
    if (!permitido) return jsonErr({ error: "Sem permissão para gerar a planilha XPM." }, 403);

    const body = await req.json();
    const { pedido_ref, fase } = body ?? {};

    // ===================== BRANCHES DE API (orfaos) =====================
    // Canal API existe SO para produto vendavel que nunca teve entrada fisica.
    // O caminho principal do cadastro continua sendo a planilha Cad_item, abaixo.
    if (body?.tipo === "cadastrar_api" || body?.tipo === "corrigir_categoria_xpm") {
      const t0 = Date.now();
      const tipo: string = body.tipo;
      const skus: string[] = Array.isArray(body.skus) ? body.skus : [];
      const dry_run: boolean = tipo === "cadastrar_api" ? (body.dry_run ?? true) : false;
      const resultados: Record<string, unknown>[] = [];

      try {
        if (skus.length === 0) throw new Error("skus obrigatorio");
        if (skus.length > 10) throw new Error("teto de 10 SKUs por chamada (volume de orfao nao justifica lote)");

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
        if (!authRes.ok || !token) throw new Error(`auth falhou: ${authJson?.error?.message ?? authRes.status}`);
        const hJson = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

        for (const sku of skus) {
          if (tipo === "corrigir_categoria_xpm") {
            const { data: cache, error: eCache } = await supabase
              .from("xpm_produtos_cache").select("xpm_produto_id").eq("codigo", sku).maybeSingle();
            if (eCache) throw new Error(`xpm_produtos_cache ${sku}: ${eCache.message}`);
            if (!cache?.xpm_produto_id) { resultados.push({ sku, status: "nao_esta_no_xpm" }); continue; }

            // Ignora pode_enviar de proposito: aqui o "JA CADASTRADO no XPM" e esperado.
            const { data: pay, error: ePay } = await supabase.rpc("fn_xpm_payload_cadastro", { p_sku: sku });
            if (ePay) throw new Error(`fn_xpm_payload_cadastro ${sku}: ${ePay.message}`);
            const p1 = (pay as any)?.passo_1_produto;
            if (!p1) { resultados.push({ sku, status: "erro_payload", erro: "passo_1_produto ausente" }); continue; }

            // PUT so e alcancavel daqui: pg_net do banco nao tem http_put.
            const r = await fetch(`${base}/api/services/app/Produto/Update`, {
              method: "PUT", headers: hJson, body: JSON.stringify({ ...p1, id: cache.xpm_produto_id }),
            });
            const j = await r.json().catch(() => ({}));
            const okUp = r.ok && j?.success !== false;
            resultados.push({
              sku,
              status: okUp ? "ok" : "erro_update",
              xpm_produto_id: cache.xpm_produto_id,
              categoria_enviada: p1.categoriaId ?? null,
              ...(okUp ? {} : { erro: j?.error?.message ?? `HTTP ${r.status}` }),
            });
            continue;
          }

          // tipo === "cadastrar_api"
          const { data: pay, error: ePay } = await supabase.rpc("fn_xpm_payload_cadastro", { p_sku: sku });
          if (ePay) throw new Error(`fn_xpm_payload_cadastro ${sku}: ${ePay.message}`);
          const pv = pay as any;
          if (pv?.pode_enviar === false) {
            resultados.push({ sku, status: "bloqueado", bloqueios: pv?.bloqueios ?? [] });
            continue;
          }
          if (dry_run) {
            resultados.push({
              sku, status: "dry_run",
              passo_1_produto: pv?.passo_1_produto,
              passo_2_produto_sku: pv?.passo_2_produto_sku,
              aviso_corte: pv?.aviso_corte ?? null,
            });
            continue;
          }

          const r1 = await fetch(`${base}/api/services/app/Produto/Create`, {
            method: "POST", headers: hJson, body: JSON.stringify(pv.passo_1_produto),
          });
          const j1 = await r1.json().catch(() => ({}));
          const produtoId = j1?.result?.id;
          if (!r1.ok || j1?.success === false || !produtoId) {
            resultados.push({ sku, status: "erro_passo1", erro: j1?.error?.message ?? `HTTP ${r1.status}` });
            continue;
          }

          const r2 = await fetch(`${base}/api/services/app/ProdutoSKU/Create`, {
            method: "POST", headers: hJson,
            body: JSON.stringify({ ...pv.passo_2_produto_sku, produtoId }),
          });
          const j2 = await r2.json().catch(() => ({}));
          const skuId = j2?.result?.id;
          if (!r2.ok || j2?.success === false || !skuId) {
            // Estado mais perigoso do fluxo: produto existe, SKU nao. Nunca engolir.
            resultados.push({
              sku, status: "PRODUTO_SEM_SKU", xpm_produto_id: produtoId,
              erro: j2?.error?.message ?? `HTTP ${r2.status}`,
              acao: "retomar apenas ProdutoSKU/Create com este produtoId — NAO repetir o Produto/Create, criaria duplicata",
            });
            continue;
          }

          resultados.push({ sku, status: "ok", xpm_produto_id: produtoId, xpm_sku_id: skuId });
        }

        const okQtd = resultados.filter((r) => r.status === "ok").length;
        const errQtd = resultados.filter((r) => typeof r.status === "string" && r.status !== "ok" && r.status !== "dry_run").length;
        const { error: eLog } = await supabase.from("integracoes_sync_log").insert({
          sistema: "zenlog_prd", tipo: "cadastro_xpm", status: "sucesso",
          registros_criados: okQtd, registros_erro: errQtd, duracao_ms: Date.now() - t0,
          detalhes: { acao: tipo, dry_run, resultados },
        });
        if (eLog) throw new Error(`log: ${eLog.message}`);

        return new Response(JSON.stringify({ ok: true, tipo, dry_run, total: skus.length, resultados }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      } catch (e) {
        const { error: eLog } = await supabase.from("integracoes_sync_log").insert({
          sistema: "zenlog_prd", tipo: "cadastro_xpm", status: "erro",
          registros_criados: 0, registros_erro: skus.length, duracao_ms: Date.now() - t0,
          detalhes: { acao: tipo, dry_run, erro: (e as Error).message, resultados },
        });
        if (eLog) console.error("falha ao logar erro:", eLog.message);
        throw e;
      }
    }

    if (!pedido_ref) return new Response(JSON.stringify({ error: "pedido_ref obrigatório" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    let q = supabase.from("vw_xpm_cad_item").select("*").eq("pedido_ref", pedido_ref).order("codigo_material");
    if (fase === 1 || fase === 2) q = q.eq("fase", fase);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    const tipoRow = ["Caracter","Caracter","Caracter","Caracter","Caracter","Numerico","Caracter","","","Numerico","Numerico","Numerico","","","Numerico","Caracter","Numerico","Numerico","Numerico","Numerico","Numerico","Numerico","Numerico"];
    const unidRow = ["","","","","","Kg","","","","","","","","","","","Kg","Metro","Metro","Metro","","",""];
    const headerRow = ["Codigo Material","Categoria","Descrição","Descrição Reduzida","Unid. med","Peso Liquido","codigoBarras","Cod. Caixa","NF","Cod. NF","lastro","classificacaoFiscalNCM","Quantida de Caixas Master","Quantida de Caixas Inner","qtdItemSKU","descricaoEmbalagem","pesoSku","alturaSKU","larguraSKU","comprimentoSKU","Lote","Validade","Serie"];

    const dataRows = (data || []).map((r: any) => [
      r.codigo_material,
      r.categoria ?? "",
      r.descricao ?? "",
      r.descricao_reduzida ?? "",
      r.unid_med,
      "",
      r.codigo_barras ?? "",
      r.cod_caixa ?? "",
      r.nf ?? "",
      r.cod_nf ?? "",
      "",
      r.ncm ?? "",
      r.qtd_caixas_master,
      r.qtd_caixas_inner,
      r.qtd_item_sku,
      r.descricao_embalagem ?? "",
      r.peso_sku,
      r.altura_m,
      r.largura_m,
      r.comprimento_m,
      r.lote ?? "",
      "",
      "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([tipoRow, unidRow, headerRow, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cad_item");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    return new Response(buf, { headers: { ...cors, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="XPM_Cad_item_${pedido_ref}.xlsx"` } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
