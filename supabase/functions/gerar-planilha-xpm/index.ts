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
    if (body?.tipo === "cadastrar_api" || body?.tipo === "corrigir_categoria_xpm" || body?.tipo === "atualizar_cadastro_xpm") {
      const t0 = Date.now();
      const tipo: string = body.tipo;
      const skus: string[] = Array.isArray(body.skus) ? body.skus : [];
      const dry_run: boolean = tipo === "corrigir_categoria_xpm" ? false : (body.dry_run ?? true);
      const resultados: Record<string, unknown>[] = [];
      const teto = tipo === "atualizar_cadastro_xpm" ? 200 : 10;

      try {
        if (skus.length === 0) throw new Error("skus obrigatorio");
        if (skus.length > teto) throw new Error(`teto de ${teto} SKUs por chamada`);


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

        // Mapa categoria_id -> categoria_codigo, carregado UMA vez por invocacao.
        // A comparacao de categoria compara CODIGOS (o payload manda id);
        // sem entrada no mapa para o id, a categoria simplesmente nao e comparada.
        const codigoDoMapa = new Map<string, string>();
        if (tipo === "atualizar_cadastro_xpm") {
          const { data: catMap, error: eCat } = await supabase
            .from("xpm_categoria_map").select("categoria_codigo, categoria_id");
          if (eCat) throw new Error(`xpm_categoria_map: ${eCat.message}`);
          for (const c of (catMap ?? []) as any[]) codigoDoMapa.set(String(c.categoria_id), String(c.categoria_codigo));
        }

        for (const sku of skus) {
          // ===== CORRECAO DE CADASTRO NO XPM PELA MATRIZ (de-para + PUT) =====
          if (tipo === "atualizar_cadastro_xpm") {
            const { data: cache, error: eCache } = await supabase
              .from("xpm_produtos_cache")
              .select("xpm_produto_id, descricao, ncm, peso_unitario_kg, altura_m, largura_m, comprimento_m, categoria_codigo")
              .eq("codigo", sku).maybeSingle();
            if (eCache) throw new Error(`xpm_produtos_cache ${sku}: ${eCache.message}`);
            if (!cache?.xpm_produto_id) { resultados.push({ sku, status: "nao_esta_no_xpm" }); continue; }

            const { data: pay, error: ePay } = await supabase.rpc("fn_xpm_payload_cadastro", { p_sku: sku });
            if (ePay) throw new Error(`fn_xpm_payload_cadastro ${sku}: ${ePay.message}`);
            const pv = pay as any;

            // GUARDA: matriz furada NUNCA sobrescreve o XPM. O unico bloqueio tolerado
            // e o "JA CADASTRADO no XPM" — aqui ele e justamente o esperado.
            const bloqueios: string[] = (Array.isArray(pv?.bloqueios) ? pv.bloqueios : []).map((b: unknown) => String(b));
            const impeditivos = bloqueios.filter((b) => !/JA CADASTRADO/i.test(b));
            if (impeditivos.length > 0) { resultados.push({ sku, status: "matriz_incompleta", bloqueios: impeditivos }); continue; }

            const p1 = pv?.passo_1_produto;
            if (!p1) { resultados.push({ sku, status: "erro_payload", erro: "passo_1_produto ausente" }); continue; }

            const so = (v: unknown) => (v == null ? "" : String(v).trim());
            const digitos = (v: unknown) => so(v).replace(/\D/g, "");
            const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
            const de_para: { campo: string; xpm: unknown; novo: unknown }[] = [];
            const cmpTexto = (campo: string, atual: string, novo: string) => { if (atual !== novo) de_para.push({ campo, xpm: atual, novo }); };
            const cmpNum = (campo: string, atual: unknown, novo: unknown) => {
              const a = num(atual), b = num(novo);
              if (b == null) return;
              if (a == null || Math.abs(a - b) > 0.001) de_para.push({ campo, xpm: a, novo: b });
            };
            cmpTexto("descricao", so(cache.descricao), so(p1.descricao));
            cmpTexto("ncm", digitos(cache.ncm), digitos(p1.classificacaoFiscalNCM));
            cmpNum("peso_kg", cache.peso_unitario_kg, p1.pesoUnitario);
            cmpNum("altura_m", cache.altura_m, p1.altura);
            cmpNum("largura_m", cache.largura_m, p1.largura);
            cmpNum("comprimento_m", cache.comprimento_m, p1.comprimento);
            // Categoria: o payload manda categoriaId; comparamos CODIGO do mapa.
            // Id sem entrada no mapa -> nao acusa (nao ha como comparar).
            const codMapaNovo = codigoDoMapa.get(String(p1.categoriaId));
            if (codMapaNovo !== undefined) cmpTexto("categoria", so(cache.categoria_codigo), codMapaNovo);

            if (de_para.length === 0) { resultados.push({ sku, status: "sem_diferenca" }); continue; }
            if (dry_run) { resultados.push({ sku, status: "tem_diferenca", xpm_produto_id: cache.xpm_produto_id, de_para }); continue; }

            const r = await fetch(`${base}/api/services/app/Produto/Update`, {
              method: "PUT", headers: hJson, body: JSON.stringify({ ...p1, id: cache.xpm_produto_id }),
            });
            const j = await r.json().catch(() => ({}));
            if (!(r.ok && j?.success !== false)) {
              resultados.push({ sku, status: "erro_update", xpm_produto_id: cache.xpm_produto_id, de_para, erro: j?.error?.message ?? `HTTP ${r.status}` });
              continue;
            }
            // Espelha o que foi enviado para a leitura refletir na hora.
            // categoria_codigo: codigo do mapa correspondente ao id enviado (quando existir).
            const codEspelho = codigoDoMapa.get(String(p1.categoriaId));
            const { error: eUpd } = await supabase.from("xpm_produtos_cache").update({
              descricao: p1.descricao ?? null,
              ncm: p1.classificacaoFiscalNCM ?? null,
              peso_unitario_kg: num(p1.pesoUnitario),
              altura_m: num(p1.altura),
              largura_m: num(p1.largura),
              comprimento_m: num(p1.comprimento),
              ...(codEspelho !== undefined ? { categoria_codigo: codEspelho } : {}),
              sincronizado_em: new Date().toISOString(),
            }).eq("codigo", sku);
            if (eUpd) throw new Error(`espelho xpm_produtos_cache ${sku}: ${eUpd.message}`);
            resultados.push({ sku, status: "ok", xpm_produto_id: cache.xpm_produto_id, de_para });
            continue;
          }

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
        if (tipo === "atualizar_cadastro_xpm") {
          // Dry-run nao e execucao: nao registra log.
          if (!dry_run) {
            const { error: eLogU } = await supabase.from("integracoes_sync_log").insert({
              sistema: "zenlog_prd", tipo: "produto_update", status: errQtd > 0 ? "parcial" : "sucesso",
              registros_atualizados: okQtd, registros_erro: errQtd, duracao_ms: Date.now() - t0,
              detalhes: {
                acao: tipo,
                oks: resultados.filter((r) => r.status === "ok"),
                falhas: resultados.filter((r) => r.status !== "ok"),
              },
            });
            if (eLogU) throw new Error(`log: ${eLogU.message}`);
          }
        } else {
          const { error: eLog } = await supabase.from("integracoes_sync_log").insert({
            sistema: "zenlog_prd", tipo: "cadastro_xpm", status: "sucesso",
            registros_criados: okQtd, registros_erro: errQtd, duracao_ms: Date.now() - t0,
            detalhes: { acao: tipo, dry_run, resultados },
          });
          if (eLog) throw new Error(`log: ${eLog.message}`);
        }

        return new Response(JSON.stringify({ ok: true, tipo, dry_run, total: skus.length, resultados }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      } catch (e) {
        const { error: eLog } = await supabase.from("integracoes_sync_log").insert({
          sistema: "zenlog_prd", tipo: tipo === "atualizar_cadastro_xpm" ? "produto_update" : "cadastro_xpm", status: "erro",
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
