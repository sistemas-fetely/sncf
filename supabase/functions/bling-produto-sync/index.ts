import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { comparar, montarPatch, exigirEscrita, type Campo } from "./regras.ts";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ acao: z.enum(["diff", "aplicar", "automatico"]).default("diff"), execucao_id: z.string().uuid().optional() });
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
    if (body.acao !== "diff") exigirEscrita(config);
    if (body.acao === "automatico" && !config.automatico_habilitado) return json({ ok: true, desligado: true });
    const lock = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease }); check(lock);
    if (!lock.data) return json({ ok: false, erro: "Outra comparação/envio está em andamento. Tente novamente." }, 409);
    locked = true;
    const campos = config.campos as Campo[];
    const cfgR = await sb.from("integracoes_config").select("*").eq("sistema", "bling").single(); check(cfgR);
    if (!cfgR.data?.access_token) throw new Error("Bling não conectado.");
    const client = makeBlingClient(sb, cfgR.data, await ensureFreshToken(sb, cfgR.data));
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
      const page = await sb.from("bling_produto_sync_produto").select("*").eq("execucao_id", execucaoId).eq("status", "pendente").order("sku").limit(40); check(page);
      for (const p of page.data ?? []) {
        if (Date.now() - inicioMs > 40000) break;
        await sleep(350);
        try {
          const atual = (await client.get(`/produtos/${encodeURIComponent(p.bling_id)}`))?.data;
          if (!atual?.id) throw new Error("Bling retornou detalhe vazio.");
          const itens = comparar(p.fonte, atual, campos);
          if (itens.length) check(await sb.from("bling_produto_sync_item").upsert(itens.map((i) => ({ ...i, execucao_id: execucaoId, sku: p.sku, bling_id: p.bling_id })), { onConflict: "execucao_id,sku,campo" }));
          check(await sb.from("bling_produto_sync_produto").update({ status: "comparado", lido_em: new Date().toISOString(), erro: null }).eq("execucao_id", execucaoId).eq("sku", p.sku));
        } catch (e) {
          check(await sb.from("bling_produto_sync_produto").update({ status: "erro", erro: msg(e), lido_em: new Date().toISOString() }).eq("execucao_id", execucaoId).eq("sku", p.sku));
        }
      }
      const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
      if (resumoR.data.restantes === 0) check(await sb.from("bling_produto_sync_execucao").update({ status: "comparado", atualizado_em: new Date().toISOString() }).eq("id", execucaoId));
      if (body.acao === "diff") return json({ ok: true, execucao_id: execucaoId, concluido: resumoR.data.restantes === 0, resumo: resumoR.data });
    }
    const statusR = await sb.from("bling_produto_sync_execucao").select("status").eq("id", execucaoId).single(); check(statusR);
    if (statusR.data?.status !== "comparado" && statusR.data?.status !== "aplicando") throw new Error("Conclua a comparação antes de enviar.");
    check(await sb.from("bling_produto_sync_execucao").update({ status: "aplicando" }).eq("id", execucaoId));
    const pendentes = await sb.from("bling_produto_sync_item").select("*").eq("execucao_id", execucaoId).eq("status", "pendente").order("sku").limit(220); check(pendentes);
    const skus = [...new Set((pendentes.data ?? []).map((i: any) => i.sku))].slice(0, 20);
    for (const sku of skus) {
      if (Date.now() - inicioMs > 40000) break;
      const itens = (pendentes.data ?? []).filter((i: any) => i.sku === sku);
      try {
        const fonteR = await sb.from("sncf_produtos").select("*").eq("sku", sku).single(); check(fonteR);
        if (!fonteR.data?.ativo) throw new Error("Produto inativo no SNCF; refaça a comparação.");
        const vincR = await sb.from("produtos").select("id,bling_id").eq("codigo", sku).order("created_at").limit(1).single(); check(vincR);
        if (!vincR.data || vincR.data.bling_id !== itens[0].bling_id) throw new Error("Vínculo Bling mudou; refaça a comparação.");
        await sleep(350);
        const atual = (await client.get(`/produtos/${encodeURIComponent(itens[0].bling_id)}`))?.data;
        const frescas = comparar(fonteR.data, atual, campos);
        const aplicar = frescas.filter((d) => itens.some((i: any) => i.campo === d.campo));
        const patch = montarPatch(aplicar);
        let detalhe = atual;
        if (Object.keys(patch).length) {
          await sleep(350);
          const retorno = await client.patch(`/produtos/${encodeURIComponent(itens[0].bling_id)}`, patch);
          detalhe = retorno?.data;
          if (!detalhe?.id || detalhe.pesoBruto === undefined) { await sleep(350); detalhe = (await client.get(`/produtos/${encodeURIComponent(itens[0].bling_id)}`))?.data; }
        }
        if (!detalhe?.id) throw new Error("PATCH concluído, mas leitura de confirmação vazia.");
        check(await sb.from("produtos").update({ detalhe_payload: detalhe, detalhe_lido_em: new Date().toISOString(), detalhe_erro: null,
          peso_bruto: detalhe.pesoBruto, peso_liquido: detalhe.pesoLiquido, altura_cm: detalhe.dimensoes?.altura, largura_cm: detalhe.dimensoes?.largura, profundidade_cm: detalhe.dimensoes?.profundidade }).eq("id", vincR.data.id));
        check(await sb.from("bling_produto_sync_item").update({ status: "aplicado", erro: null, atualizado_em: new Date().toISOString() }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente"));
        check(await sb.from("bling_produto_sync_produto").update({ status: "aplicado", erro: null }).eq("execucao_id", execucaoId).eq("sku", sku));
        const filaSku = fila.find((f) => f.sku === sku);
        if (filaSku) check(await sb.from("bling_produto_sync_fila").update({ status: "aplicado", execucao_id: execucaoId }).eq("sku", sku).eq("versao", filaSku.versao));
      } catch (e) {
        check(await sb.from("bling_produto_sync_item").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente"));
        check(await sb.from("bling_produto_sync_produto").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku));
      }
    }
    const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
    if (!resumoR.data.pendentes) check(await sb.from("bling_produto_sync_execucao").update({ status: "concluido", concluido_em: new Date().toISOString() }).eq("id", execucaoId));
    return json({ ok: true, execucao_id: execucaoId, concluido: !resumoR.data.pendentes, resumo: resumoR.data });
  } catch (e) { return json({ ok: false, erro: msg(e), execucao_id: execucaoId }, 500); }
  finally { if (locked) { const r = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease, p_liberar: true }); if (r.error) console.error("Liberar trava:", r.error.message); } }
});