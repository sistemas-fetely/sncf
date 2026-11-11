import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { comparar, montarPatch, exigirEscrita, dentroDoFiltro, confirmarCodigo, type Campo } from "./regras.ts";
import { resolverProduto, codigoBling } from "./resolver.ts";
import { fonteComInner } from "./inner.ts";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ acao: z.enum(["diff", "aplicar", "automatico", "consultar"]).default("diff"), execucao_id: z.string().uuid().optional(), skus: z.array(z.string().min(1).max(255)).max(1000).optional(), campos: z.array(z.string().min(1).max(255)).max(100).optional() });
const msg = (e: unknown) => {
  if (e instanceof BlingHttpError) { try { const b = JSON.parse(e.corpo); return `Bling ${e.status}: ${b.error?.message ?? b.message ?? e.message}`; } catch { return e.message; } }
  return e instanceof Error ? e.message : String(e);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, erro: "Configuração ausente." }, 500);
  const sb = createClient(url, key);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, erro: "Sessão necessária." }, 401);
  const { data: auth, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !auth.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, erro: parsed.error.flatten() }, 400);
  const body = parsed.data;
  const slug = body.acao === "diff" ? "acao.varrer_bling" : "acao.produto_corrigir_externo";
  const { data: pode, error: permErr } = await sb.rpc("usuario_tem_acao", { p_slug: slug, p_user_id: auth.user.id });
  if (permErr) return json({ ok: false, erro: permErr.message }, 500);
  if (!pode) return json({ ok: false, erro: `Sem permissão (${slug}).` }, 403);
  const lease = crypto.randomUUID(); let locked = false;
  const check = (r: { error?: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  let execucaoId = body.execucao_id;
  try {
    const configR = await sb.from("bling_produto_sync_config").select("*").eq("id", true).single(); check(configR);
    const config = configR.data; if (!config) throw new Error("Configuração de cadastro ausente.");
    if (body.acao !== "diff" && body.acao !== "consultar") exigirEscrita(config);
    if (body.acao === "automatico" && !config.automatico_habilitado) return json({ ok: true, desligado: true });
    const lock = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease }); check(lock);
    if (!lock.data) return json({ ok: false, erro: "Outra comparação/envio está em andamento. Tente novamente." }, 409);
    locked = true;
    const campos = config.campos as Campo[];
    const cfgR = await sb.from("integracoes_config").select("*").eq("sistema", "bling").single(); check(cfgR);
    if (!cfgR.data?.access_token) throw new Error("Bling não conectado.");
    const client = makeBlingClient(sb, cfgR.data, await ensureFreshToken(sb, cfgR.data));
    if (body.acao === "consultar") {
      if (!execucaoId || !body.skus?.length) throw new Error("Consulta exige execucao_id e skus explícitos.");
      const produtosR = await sb.from("bling_produto_sync_produto").select("sku,bling_id,fonte").eq("execucao_id", execucaoId).in("sku", body.skus); check(produtosR);
      const produtos = [];
      for (const p of produtosR.data ?? []) {
        await sleep(350);
        const detalhe = (await client.get(`/produtos/${encodeURIComponent(p.bling_id)}`))?.data;
        confirmarCodigo(detalhe, codigoBling({ ...p.fonte, sku: p.sku }), p.bling_id);
        produtos.push({ sku: p.sku, bling_id: p.bling_id, codigo: detalhe.codigo, dimensoes: detalhe.dimensoes, itensPorCaixa: detalhe.itensPorCaixa });
      }
      return json({ ok: true, produtos });
    }
    let fila: any[] = [];
    if (!execucaoId) {
      if (body.acao === "aplicar") throw new Error("execucao_id obrigatório para enviar.");
      if (body.acao === "automatico") {
        const f = await sb.from("bling_produto_sync_fila").select("sku,versao").eq("status", "pendente").order("enfileirado_em").limit(20); check(f); fila = f.data ?? [];
        if (!fila.length) return json({ ok: true, vazio: true });
      }
      const inicio = await sb.rpc("fn_bling_produto_sync_iniciar", { p_usuario: auth.user.id, p_skus: body.acao === "automatico" ? fila.map((f) => f.sku) : null, p_origem: body.acao === "automatico" ? "automatico" : "manual" }); check(inicio);
      execucaoId = inicio.data;
    }
    const execR = await sb.from("bling_produto_sync_execucao").select("*").eq("id", execucaoId).single(); check(execR);
    const inicioMs = Date.now();
    const diff = body.acao === "diff" || body.acao === "automatico";
    if (diff) {
      if (!body.execucao_id) check(await sb.from("bling_produto_sync_produto").update({ status: "pendente" }).eq("execucao_id", execucaoId).eq("status", "ignorado"));
      const page = await sb.from("bling_produto_sync_produto").select("*").eq("execucao_id", execucaoId).eq("status", "pendente").order("sku").limit(40); check(page);
      const cacheR = await sb.from("bling_produtos_cache").select("sku,bling_produto_id").in("sku", (page.data ?? []).map((p: any) => p.sku)); check(cacheR);
      const cache = new Map((cacheR.data ?? []).map((p: any) => [p.sku, p.bling_produto_id]));
      const get = async (endpoint: string) => { await sleep(350); return client.get(endpoint); };
      for (const p of page.data ?? []) {
        if (Date.now() - inicioMs > 40000) break;
        try {
          const resolvido = await resolverProduto(codigoBling({ ...p.fonte, sku: p.sku }), cache.get(p.sku), p.bling_id, get);
          const fonte = { ...await fonteComInner(sb, p.fonte), resolucao_bling: { ...resolvido.resolucao, unidade_medida: resolvido.detalhe?.dimensoes?.unidadeMedida ?? null } };
          check(await sb.from("bling_produto_sync_produto").update({ bling_id: resolvido.bling_id, fonte, sem_vinculo: !resolvido.detalhe, status: resolvido.detalhe ? "pendente" : "ignorado", lido_em: new Date().toISOString(), erro: null }).eq("execucao_id", execucaoId).eq("sku", p.sku));
          const atual = resolvido.detalhe;
          if (!atual) continue;
          const itens = comparar(fonte, atual, campos);
          if (itens.length) check(await sb.from("bling_produto_sync_item").upsert(itens.map((i) => ({ ...i, execucao_id: execucaoId, sku: p.sku, bling_id: resolvido.bling_id })), { onConflict: "execucao_id,sku,campo" }));
          check(await sb.from("bling_produto_sync_produto").update({ status: "comparado", lido_em: new Date().toISOString(), erro: null }).eq("execucao_id", execucaoId).eq("sku", p.sku));
        } catch (e) {
          check(await sb.from("bling_produto_sync_produto").update({ status: "erro", erro: msg(e), lido_em: new Date().toISOString() }).eq("execucao_id", execucaoId).eq("sku", p.sku));
        }
      }
      const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
      const produtosR = await sb.from("bling_produto_sync_produto").select("status,fonte").eq("execucao_id", execucaoId); check(produtosR);
      resumoR.data.comparados = (produtosR.data ?? []).filter((p: any) => p.status === "comparado").length;
      resumoR.data.ids_desatualizados = (produtosR.data ?? []).filter((p: any) => p.fonte?.resolucao_bling?.id_desatualizado).length;
      if (resumoR.data.restantes === 0) check(await sb.from("bling_produto_sync_execucao").update({ status: "comparado", atualizado_em: new Date().toISOString() }).eq("id", execucaoId));
      if (body.acao === "diff") return json({ ok: true, execucao_id: execucaoId, concluido: resumoR.data.restantes === 0, resumo: resumoR.data });
    }
    const statusR = await sb.from("bling_produto_sync_execucao").select("status").eq("id", execucaoId).single(); check(statusR);
    if (statusR.data?.status !== "comparado" && statusR.data?.status !== "aplicando") throw new Error("Conclua a comparação antes de enviar.");
    check(await sb.from("bling_produto_sync_execucao").update({ status: "aplicando" }).eq("id", execucaoId));
    let pendentesQ = sb.from("bling_produto_sync_item").select("*").eq("execucao_id", execucaoId).eq("status", "pendente");
    if (body.skus !== undefined) pendentesQ = pendentesQ.in("sku", body.skus);
    if (body.campos !== undefined) pendentesQ = pendentesQ.in("campo", body.campos);
    const pendentes = await pendentesQ.order("sku").limit(220); check(pendentes);
    const skus = [...new Set((pendentes.data ?? []).map((i: any) => i.sku))].slice(0, 20);
    const resultados: any[] = [];
    for (const sku of skus) {
      if (Date.now() - inicioMs > 40000) break;
      const itens = (pendentes.data ?? []).filter((i: any) => i.sku === sku && dentroDoFiltro(i, body));
      if (!itens.length) continue;
      let camposSelecionados = itens.map((i: any) => i.campo);
      try {
        const fonteR = await sb.from("sncf_produtos").select("*").eq("sku", sku).single(); check(fonteR);
        if (!fonteR.data?.ativo) throw new Error("Produto inativo no SNCF; refaça a comparação.");
        const fonte = await fonteComInner(sb, fonteR.data);
        if (!fonte.inner_confirmado && camposSelecionados.includes("itensPorCaixa")) {
          check(await sb.from("bling_produto_sync_item").update({ status: "ignorado", erro: "Inner não confirmado; nenhum envio deste campo.", atualizado_em: new Date().toISOString() }).eq("execucao_id", execucaoId).eq("sku", sku).eq("campo", "itensPorCaixa").eq("status", "pendente"));
          camposSelecionados = camposSelecionados.filter((c: string) => c !== "itensPorCaixa");
          if (!camposSelecionados.length) { resultados.push({ sku, status: "ignorado", motivo: "Inner não confirmado" }); continue; }
        }
        const execProdutoR = await sb.from("bling_produto_sync_produto").select("bling_id").eq("execucao_id", execucaoId).eq("sku", sku).single(); check(execProdutoR);
        const blingId = execProdutoR.data?.bling_id;
        if (!blingId || itens.some((i: any) => String(i.bling_id) !== String(blingId))) throw new Error("ID resolvido inconsistente na execução; refaça a comparação.");
        const codigo = codigoBling(fonteR.data);
        await sleep(350);
        const atual = (await client.get(`/produtos/${encodeURIComponent(blingId)}`))?.data;
        confirmarCodigo(atual, codigo, blingId);
        const frescas = comparar(fonte, atual, campos);
        const aplicar = frescas.filter((d) => camposSelecionados.includes(d.campo));
        const patch = montarPatch(aplicar, fonte);
        let detalhe = atual;
        if (Object.keys(patch).length) {
          await sleep(350);
          await client.patch(`/produtos/${encodeURIComponent(blingId)}`, patch);
          await sleep(350); detalhe = (await client.get(`/produtos/${encodeURIComponent(blingId)}`))?.data;
        }
        if (!detalhe?.id) throw new Error("PATCH concluído, mas leitura de confirmação vazia.");
        confirmarCodigo(detalhe, codigo, blingId);
        const restantesBling = comparar(fonte, detalhe, campos).filter((i) => camposSelecionados.includes(i.campo));
        if (restantesBling.length) throw new Error(`Bling não confirmou os campos: ${restantesBling.map((i) => i.campo).join(", ")}`);
        let espelhoAviso: string | null = null;
        const vincR = await sb.from("produtos").select("id").eq("codigo", codigo).order("created_at").limit(1).maybeSingle();
        if (vincR.error || !vincR.data) espelhoAviso = vincR.error?.message ?? `Espelho não localizado pelo código ${codigo}.`;
        else {
          const espelhoR = await sb.from("produtos").update({ detalhe_payload: detalhe, detalhe_lido_em: new Date().toISOString(), detalhe_erro: null,
            peso_bruto: detalhe.pesoBruto, peso_liquido: detalhe.pesoLiquido, altura_cm: detalhe.dimensoes?.altura, largura_cm: detalhe.dimensoes?.largura, profundidade_cm: detalhe.dimensoes?.profundidade }).eq("id", vincR.data.id);
          espelhoAviso = espelhoR.error?.message ?? null;
        }
        if (espelhoAviso) console.warn("Espelho Bling:", sku, espelhoAviso);
        check(await sb.from("bling_produto_sync_item").update({ status: "aplicado", erro: null, atualizado_em: new Date().toISOString() }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente").in("campo", camposSelecionados));
        const saldoR = await sb.from("bling_produto_sync_item").select("campo", { count: "exact", head: true }).eq("execucao_id", execucaoId).eq("sku", sku).neq("status", "aplicado"); check(saldoR);
        check(await sb.from("bling_produto_sync_produto").update({ status: saldoR.count ? "comparado" : "aplicado", erro: espelhoAviso }).eq("execucao_id", execucaoId).eq("sku", sku));
        resultados.push({ sku, bling_id: blingId, antes: atual.dimensoes, depois: detalhe.dimensoes, itensPorCaixa_antes: atual.itensPorCaixa, itensPorCaixa_depois: detalhe.itensPorCaixa, patch, status: "aplicado", espelho_aviso: espelhoAviso });
        const filaSku = fila.find((f) => f.sku === sku);
        if (filaSku) check(await sb.from("bling_produto_sync_fila").update({ status: "aplicado", execucao_id: execucaoId }).eq("sku", sku).eq("versao", filaSku.versao));
      } catch (e) {
        resultados.push({ sku, status: "erro", erro: msg(e) });
        check(await sb.from("bling_produto_sync_item").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente").in("campo", camposSelecionados));
        check(await sb.from("bling_produto_sync_produto").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku));
      }
    }
    const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
    if (!resumoR.data.pendentes) check(await sb.from("bling_produto_sync_execucao").update({ status: "concluido", concluido_em: new Date().toISOString() }).eq("id", execucaoId));
    return json({ ok: true, execucao_id: execucaoId, concluido: !resumoR.data.pendentes, resumo: resumoR.data, resultados });
  } catch (e) { return json({ ok: false, erro: msg(e), execucao_id: execucaoId }, 500); }
  finally { if (locked) { const r = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease, p_liberar: true }); if (r.error) console.error("Liberar trava:", r.error.message); } }
});