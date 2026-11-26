// BLING-MOTOR-UNICO-2 (26/11/2026): único motor que lê e escreve cadastro de produto no Bling.
// Ações: diff (segundo plano encadeado) · incremental (diff só do que mudou) · aplicar (envio em massa só de sobrescreve=true)
// · previa/corrigir (até 20 skus, ao vivo) · consultar · automatico (fila).
// Campos vêm de produto_campo_destino (Bling, ativo, na_correcao) a cada chamada; bling_produto_sync_config.campos não é lido.
// Ritmo: no máximo 1 chamada ao Bling a cada 350 ms (do início da anterior), até 3 em paralelo; leituras/gravações do banco em lote por página.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { carregarFaseDestino, carregarGruposBling } from "../_shared/bling/montar-valores-produto.ts";
import { comparar, montarPatch, exigirEscrita, dentroDoFiltro, confirmarCodigo, camposDoBanco, camposEmMassa, enriquecerFonte, fiscaisPreservados, ROTULOS, type Contexto, type Diferenca } from "./regras.ts";
import { resolverProduto, codigoBling } from "./resolver.ts";
import { fonteComInner, innersEmLote } from "./inner.ts";
import { portaCronPermite } from "./porta.ts";
import { criarRitmo, emParalelo } from "./ritmo.ts";
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ acao: z.enum(["diff", "aplicar", "automatico", "consultar", "previa", "corrigir", "incremental"]).default("diff"), execucao_id: z.string().uuid().optional(), skus: z.array(z.string().min(1).max(255)).max(1000).optional(), campos: z.array(z.string().min(1).max(255)).max(100).optional() });
const msg = (e: unknown) => {
  if (e instanceof BlingHttpError) { try { const b = JSON.parse(e.corpo); return `Bling ${e.status}: ${b.error?.message ?? b.message ?? e.message}`; } catch { return e.message; } }
  return e instanceof Error ? e.message : String(e);
};
const PARALELO = 3, PAGINA = 100, ORCAMENTO_MS = 40000;
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ ok: false, erro: "Configuração ausente." }, 500);
  const sb = createClient(url, key);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, erro: parsed.error.flatten() }, 400);
  const body = parsed.data;
  if ((body.acao === "previa" || body.acao === "corrigir") && (!body.skus?.length || body.skus.length > 20)) return json({ ok: false, erro: "Prévia/correção exige de 1 a 20 skus." }, 400);
  const { data: segredo, error: segErr } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  if (segErr || !segredo) return json({ ok: false, erro: `Não foi possível ler o SYNC_CRON_SECRET: ${segErr?.message ?? "vazio"}` }, 500);
  const segredoRecebido = req.headers.get("x-cron-secret");
  let usuarioId: string | null = null;
  if (segredoRecebido) {
    if (segredoRecebido !== segredo) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
    if (!portaCronPermite(body)) return json({ ok: false, erro: "Pela porta x-cron-secret só é permitido diff com execucao_id ou incremental." }, 403);
  } else {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, erro: "Sessão necessária." }, 401);
    const { data: auth, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !auth.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
    usuarioId = auth.user.id;
    const slug = body.acao === "diff" || body.acao === "incremental" ? "acao.varrer_bling" : "acao.produto_corrigir_externo";
    const { data: pode, error: permErr } = await sb.rpc("usuario_tem_acao", { p_slug: slug, p_user_id: usuarioId });
    if (permErr) return json({ ok: false, erro: permErr.message }, 500);
    if (!pode) return json({ ok: false, erro: `Sem permissão (${slug}).` }, 403);
  }
  const lease = crypto.randomUUID(); let locked = false;
  const check = (r: { error?: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  let execucaoId = body.execucao_id;
  try {
    const configR = await sb.from("bling_produto_sync_config").select("id,escrita_habilitada,automatico_habilitado").eq("id", true).single(); check(configR);
    const config = configR.data; if (!config) throw new Error("Configuração de cadastro ausente.");
    if (["aplicar", "automatico", "corrigir"].includes(body.acao)) exigirEscrita(config);
    if (body.acao === "automatico" && !config.automatico_habilitado) return json({ ok: true, desligado: true });
    const pcdR = await sb.from("produto_campo_destino").select("campo,sobrescreve").eq("sistema", "Bling").eq("ativo", true).eq("na_correcao", true); check(pcdR);
    const { campos, avisos: avisosConfig } = camposDoBanco(pcdR.data ?? []);
    if (avisosConfig.length) console.warn(avisosConfig.join(" | "));
    const faseDestino = await carregarFaseDestino(sb, "Bling");
    if (body.acao !== "previa") {
      const lock = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease }); check(lock);
      if (!lock.data) return json({ ok: false, erro: "Outra comparação/envio está em andamento. Tente novamente." }, 409);
      locked = true;
    }
    const cfgR = await sb.from("integracoes_config").select("*").eq("sistema", "bling").single(); check(cfgR);
    if (!cfgR.data?.access_token) throw new Error("Bling não conectado.");
    const client = makeBlingClient(sb, cfgR.data, await ensureFreshToken(sb, cfgR.data));
    const ritmo = criarRitmo(350);
    // GET com até 2 novas tentativas em 429 (o Bling não processou a leitura); PATCH nunca é repetido.
    const getComRetry = async (e: string): Promise<any> => { for (let t = 0; ; t++) { await ritmo(); try { return await client.get(e); } catch (err) { if (!(err instanceof BlingHttpError && err.status === 429) || t >= 2) throw err; await new Promise((r) => setTimeout(r, 1000 * (t + 1))); } } };
    const bl = { get: getComRetry, patch: async (e: string, b: unknown) => { await ritmo(); return client.patch(e, b); } };
    const ctx: Contexto = {};
    const garantirGrupos = async () => { if (!ctx.grupos && campos.some((c) => c.tipo === "grupo")) ctx.grupos = await carregarGruposBling(bl, 0); };
    const agora = () => new Date().toISOString();
    const espelho = async (blingId: string, d: Record<string, any>, comMedidas = false) => {
      const r = await sb.from("produtos").update({ detalhe_payload: d, detalhe_lido_em: agora(), detalhe_erro: null,
        ...(comMedidas ? { peso_bruto: d.pesoBruto, peso_liquido: d.pesoLiquido, altura_cm: d.dimensoes?.altura, largura_cm: d.dimensoes?.largura, profundidade_cm: d.dimensoes?.profundidade } : {}) }).eq("bling_id", String(blingId));
      return r.error ? `Espelho Bling: ${r.error.message}` : null;
    };
    const deParaDe = (d: Diferenca) => ({ campo: d.campo, rotulo: ROTULOS[d.campo] ?? d.campo, bling: d.valor_bling, sncf: d.valor_sncf });

    if (body.acao === "previa" || body.acao === "corrigir") {
      const skus = [...new Set(body.skus!)];
      const [fichasR, xwR, cacheR] = await Promise.all([
        sb.from("sncf_produtos").select("*").in("sku", skus),
        sb.from("vw_produto_crosswalk").select("sku,bling_id_canonico").in("sku", skus),
        sb.from("bling_produtos_cache").select("sku,bling_produto_id").in("sku", skus),
      ]);
      check(fichasR); check(xwR); check(cacheR);
      const fichas = new Map((fichasR.data ?? []).map((f: any) => [f.sku, f]));
      const xw = new Map((xwR.data ?? []).map((x: any) => [x.sku, x.bling_id_canonico]));
      const cache = new Map((cacheR.data ?? []).map((c: any) => [c.sku, c.bling_produto_id]));
      const inners = await innersEmLote(sb, [...fichas.values()]);
      await garantirGrupos();
      const escrever = body.acao === "corrigir";
      const resultados = await emParalelo(skus, PARALELO, async (sku) => {
        const ficha = fichas.get(sku);
        if (!ficha) return { sku, status: "erro", erro: "SKU não encontrado no SNCF." };
        const fonte = enriquecerFonte({ ...ficha, ...inners.get(sku) }, faseDestino);
        const avisos = [...fonte.avisos];
        try {
          const codigo = codigoBling(ficha);
          const r = await resolverProduto(codigo, cache.get(sku), xw.get(sku), bl.get);
          if (!r.detalhe || !r.bling_id) return { sku, status: "sem_cadastro_no_bling", de_para: [], avisos };
          if (r.resolucao.id_desatualizado) avisos.push(`Card canônico ${r.resolucao.id_original} não conferiu; usado ${r.bling_id} pelo código.`);
          const e1 = await espelho(r.bling_id, r.detalhe); if (e1) avisos.push(e1);
          const difs = comparar(fonte, r.detalhe, campos, ctx);
          if (!escrever) {
            for (const d of difs.filter((x) => x.campo === "grupoTributario")) { try { montarPatch([d], fonte, ctx); } catch (e) { avisos.push(msg(e)); } }
            return { sku, bling_id: r.bling_id, status: difs.length ? "tem_diferenca" : "sem_diferenca", de_para: difs.map(deParaDe), avisos };
          }
          const sel = body.campos ? difs.filter((d) => body.campos!.includes(d.campo)) : difs;
          if (!sel.length) return { sku, bling_id: r.bling_id, status: "sem_diferenca", aplicados: [], avisos };
          const pedidos = sel.map((d) => d.campo);
          const patch = montarPatch(sel, fonte, ctx, r.detalhe);
          await bl.patch(`/produtos/${encodeURIComponent(r.bling_id)}`, patch);
          const depois = (await bl.get(`/produtos/${encodeURIComponent(r.bling_id)}`))?.data;
          if (!depois?.id) throw new Error("PATCH concluído, mas leitura de confirmação vazia.");
          confirmarCodigo(depois, codigo, r.bling_id);
          const e2 = await espelho(r.bling_id, depois, true); if (e2) avisos.push(e2);
          const restantes = comparar(fonte, depois, campos, ctx).filter((d) => pedidos.includes(d.campo));
          if (restantes.length) throw new Error(`Bling não confirmou os campos: ${restantes.map((d) => d.campo).join(", ")}`);
          fiscaisPreservados(r.detalhe, depois, pedidos);
          return { sku, bling_id: r.bling_id, status: "ok", aplicados: pedidos, avisos };
        } catch (e) { return { sku, status: "erro", erro: msg(e), avisos }; }
      });
      return json({ ok: true, resultados, avisos_config: avisosConfig });
    }

    if (body.acao === "consultar") {
      if (!execucaoId || !body.skus?.length) throw new Error("Consulta exige execucao_id e skus explícitos.");
      const produtosR = await sb.from("bling_produto_sync_produto").select("sku,bling_id,fonte").eq("execucao_id", execucaoId).in("sku", body.skus); check(produtosR);
      const produtos = [];
      for (const p of produtosR.data ?? []) {
        const detalhe = (await bl.get(`/produtos/${encodeURIComponent(p.bling_id)}`))?.data;
        confirmarCodigo(detalhe, codigoBling({ ...p.fonte, sku: p.sku }), p.bling_id);
        produtos.push({ sku: p.sku, bling_id: p.bling_id, codigo: detalhe.codigo, dimensoes: detalhe.dimensoes, itensPorCaixa: detalhe.itensPorCaixa });
      }
      return json({ ok: true, produtos });
    }
    let fila: any[] = [];
    if (body.acao === "incremental") {
      const todos = async (montar: (de: number, ate: number) => any) => { const out: any[] = []; for (let de = 0; ; de += 1000) { const r = await montar(de, de + 999); check(r); out.push(...(r.data ?? [])); if ((r.data ?? []).length < 1000) break; } return out; };
      const [ativos, xw, prods] = await Promise.all([
        todos((a, b) => sb.from("sncf_produtos").select("sku,atualizado_em").eq("ativo", true).order("sku").range(a, b)),
        todos((a, b) => sb.from("vw_produto_crosswalk").select("sku,bling_id_canonico").not("bling_id_canonico", "is", null).order("sku").range(a, b)),
        todos((a, b) => sb.from("produtos").select("bling_id,detalhe_lido_em,updated_at").not("bling_id", "is", null).order("id").range(a, b)),
      ]);
      const canon = new Map(xw.map((x: any) => [x.sku, String(x.bling_id_canonico)]));
      const porId = new Map<string, { lido: number | null; upd: number }>();
      for (const p of prods) {
        const lido = p.detalhe_lido_em ? Date.parse(p.detalhe_lido_em) : null, upd = p.updated_at ? Date.parse(p.updated_at) : 0;
        const prev = porId.get(String(p.bling_id));
        porId.set(String(p.bling_id), { lido: prev ? (prev.lido == null || lido == null ? null : Math.min(prev.lido, lido)) : lido, upd: Math.max(prev?.upd ?? 0, upd) });
      }
      const skus = ativos.filter((s: any) => {
        const id = canon.get(s.sku); if (!id) return false;
        const p = porId.get(id); if (!p || p.lido == null) return true;
        // A própria gravação do espelho mexe em produtos.updated_at segundos depois de detalhe_lido_em: margem de 60 s.
        return (s.atualizado_em && Date.parse(s.atualizado_em) > p.lido) || p.upd > p.lido + 60000;
      }).map((s: any) => s.sku);
      if (!skus.length) return json({ ok: true, vazio: true });
      const inicio = await sb.rpc("fn_bling_produto_sync_iniciar", { p_usuario: usuarioId, p_skus: skus, p_origem: "automatico" }); check(inicio);
      execucaoId = inicio.data;
    } else if (!execucaoId) {
      if (body.acao === "aplicar") throw new Error("execucao_id obrigatório para enviar.");
      if (body.acao === "automatico") {
        const f = await sb.from("bling_produto_sync_fila").select("sku,versao").eq("status", "pendente").order("enfileirado_em").limit(20); check(f); fila = f.data ?? [];
        if (!fila.length) return json({ ok: true, vazio: true });
      }
      const inicio = await sb.rpc("fn_bling_produto_sync_iniciar", { p_usuario: usuarioId, p_skus: body.acao === "automatico" ? fila.map((f) => f.sku) : null, p_origem: body.acao === "automatico" ? "automatico" : "manual" }); check(inicio);
      execucaoId = inicio.data;
    }
    const inicioMs = Date.now();
    const diff = body.acao === "diff" || body.acao === "automatico" || body.acao === "incremental";
    if (diff) {
      if (!body.execucao_id) check(await sb.from("bling_produto_sync_produto").update({ status: "pendente" }).eq("execucao_id", execucaoId).eq("status", "ignorado"));
      const page = await sb.from("bling_produto_sync_produto").select("*").eq("execucao_id", execucaoId).eq("status", "pendente").order("sku").limit(PAGINA); check(page);
      const linhas = (page.data ?? []) as any[];
      // Leituras em lote ANTES do laço.
      const cacheR = await sb.from("bling_produtos_cache").select("sku,bling_produto_id").in("sku", linhas.map((p) => p.sku)); check(cacheR);
      const cache = new Map((cacheR.data ?? []).map((p: any) => [p.sku, p.bling_produto_id]));
      const inners = await innersEmLote(sb, linhas.map((p) => ({ ...p.fonte, sku: p.sku })));
      if (linhas.length) await garantirGrupos();
      const t0 = Date.now();
      const feitos = (await emParalelo(linhas, PARALELO, async (p) => {
        if (Date.now() - inicioMs > ORCAMENTO_MS) return null;
        try {
          const resolvido = await resolverProduto(codigoBling({ ...p.fonte, sku: p.sku }), cache.get(p.sku), p.bling_id, bl.get);
          const fonte = { ...enriquecerFonte({ ...p.fonte, ...inners.get(p.sku) }, faseDestino), resolucao_bling: { ...resolvido.resolucao, unidade_medida: resolvido.detalhe?.dimensoes?.unidadeMedida ?? null } };
          const itens = resolvido.detalhe ? comparar(fonte, resolvido.detalhe, campos, ctx) : [];
          return { p, resolvido, fonte, itens, erro: null as string | null };
        } catch (e) { return { p, resolvido: null, fonte: p.fonte, itens: [], erro: msg(e) }; }
      })).filter((x): x is NonNullable<typeof x> => x != null);
      // Gravações em lote DEPOIS do laço.
      const lidoEm = agora();
      const espelhoErros = new Map<string, string>();
      await Promise.all(feitos.filter((f) => f.resolvido?.detalhe && f.resolvido.bling_id).map(async (f) => {
        const e = await espelho(f.resolvido!.bling_id!, f.resolvido!.detalhe!); if (e) { espelhoErros.set(f.p.sku, e); console.warn(e, f.p.sku); }
      }));
      if (feitos.length) check(await sb.from("bling_produto_sync_produto").upsert(feitos.map((f) => ({
        ...f.p, bling_id: f.resolvido?.bling_id ?? f.p.bling_id, fonte: f.fonte, lido_em: lidoEm,
        sem_vinculo: f.erro ? f.p.sem_vinculo : !f.resolvido?.detalhe,
        status: f.erro ? "erro" : f.resolvido?.detalhe ? "comparado" : "ignorado",
        erro: f.erro ?? espelhoErros.get(f.p.sku) ?? null,
      })), { onConflict: "execucao_id,sku" }));
      const itens = feitos.flatMap((f) => f.itens.map((i) => ({ ...i, execucao_id: execucaoId, sku: f.p.sku, bling_id: f.resolvido!.bling_id })));
      if (itens.length) check(await sb.from("bling_produto_sync_item").upsert(itens, { onConflict: "execucao_id,sku,campo" }));
      const msPorProduto = feitos.length ? Math.round((Date.now() - t0) / feitos.length) : null;
      console.log(`bling-produto-sync página: ${feitos.length} produtos em ${Date.now() - t0} ms (${msPorProduto} ms/produto)`);
      const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
      const produtosR = await sb.from("bling_produto_sync_produto").select("status,fonte").eq("execucao_id", execucaoId); check(produtosR);
      resumoR.data.comparados = (produtosR.data ?? []).filter((p: any) => p.status === "comparado").length;
      resumoR.data.ids_desatualizados = (produtosR.data ?? []).filter((p: any) => p.fonte?.resolucao_bling?.id_desatualizado).length;
      if (resumoR.data.restantes === 0) check(await sb.from("bling_produto_sync_execucao").update({ status: "comparado", atualizado_em: agora() }).eq("id", execucaoId));
      if (body.acao === "diff" || body.acao === "incremental") {
        if (resumoR.data.restantes > 0) {
          // Libera a trava ANTES de encadear a continuação; o finally não libera de novo.
          const lib = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease, p_liberar: true }); check(lib);
          locked = false;
          const continuar = fetch(`${url}/functions/v1/bling-produto-sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-cron-secret": String(segredo), Authorization: `Bearer ${key}` },
            body: JSON.stringify({ acao: "diff", execucao_id: execucaoId }),
          }).then(async (r) => { const t = await r.text(); if (!r.ok) console.error("Continuação da comparação falhou:", r.status, t); })
            .catch((e) => console.error("Continuação da comparação falhou:", msg(e)));
          EdgeRuntime.waitUntil(continuar);
        }
        return json({ ok: true, execucao_id: execucaoId, concluido: resumoR.data.restantes === 0, resumo: resumoR.data, ms_por_produto: msPorProduto, avisos_config: avisosConfig });
      }
    }
    const statusR = await sb.from("bling_produto_sync_execucao").select("status").eq("id", execucaoId).single(); check(statusR);
    if (statusR.data?.status !== "comparado" && statusR.data?.status !== "aplicando") throw new Error("Conclua a comparação antes de enviar.");
    check(await sb.from("bling_produto_sync_execucao").update({ status: "aplicando" }).eq("id", execucaoId));
    const emMassa = camposEmMassa(campos);
    if (body.acao === "aplicar") {
      // Envio em massa: só campos com produto_campo_destino.sobrescreve = true; o resto sai da fila com motivo.
      let q = sb.from("bling_produto_sync_item").update({ status: "ignorado", erro: "Campo não marcado para envio em massa (sobrescreve = false).", atualizado_em: agora() }).eq("execucao_id", execucaoId).eq("status", "pendente");
      if (emMassa.size) q = q.not("campo", "in", `(${[...emMassa].map((c) => `"${c}"`).join(",")})`);
      check(await q);
    }
    let pendentesQ = sb.from("bling_produto_sync_item").select("*").eq("execucao_id", execucaoId).eq("status", "pendente");
    if (body.skus !== undefined) pendentesQ = pendentesQ.in("sku", body.skus);
    if (body.campos !== undefined) pendentesQ = pendentesQ.in("campo", body.campos);
    const pendentes = await pendentesQ.order("sku").limit(220); check(pendentes);
    const skus = [...new Set((pendentes.data ?? []).map((i: any) => i.sku))].slice(0, 20);
    if (skus.length) await garantirGrupos();
    const resultados: any[] = [];
    for (const sku of skus) {
      if (Date.now() - inicioMs > ORCAMENTO_MS) break;
      const itens = (pendentes.data ?? []).filter((i: any) => i.sku === sku && dentroDoFiltro(i, body));
      if (!itens.length) continue;
      let camposSelecionados = itens.map((i: any) => i.campo);
      try {
        const fonteR = await sb.from("sncf_produtos").select("*").eq("sku", sku).single(); check(fonteR);
        if (!fonteR.data?.ativo) throw new Error("Produto inativo no SNCF; refaça a comparação.");
        const fonte = enriquecerFonte(await fonteComInner(sb, fonteR.data), faseDestino);
        if (!fonte.inner_confirmado && camposSelecionados.includes("itensPorCaixa")) {
          check(await sb.from("bling_produto_sync_item").update({ status: "ignorado", erro: "Inner não confirmado; nenhum envio deste campo.", atualizado_em: agora() }).eq("execucao_id", execucaoId).eq("sku", sku).eq("campo", "itensPorCaixa").eq("status", "pendente"));
          camposSelecionados = camposSelecionados.filter((c: string) => c !== "itensPorCaixa");
          if (!camposSelecionados.length) { resultados.push({ sku, status: "ignorado", motivo: "Inner não confirmado" }); continue; }
        }
        const execProdutoR = await sb.from("bling_produto_sync_produto").select("bling_id").eq("execucao_id", execucaoId).eq("sku", sku).single(); check(execProdutoR);
        const blingId = execProdutoR.data?.bling_id;
        if (!blingId || itens.some((i: any) => String(i.bling_id) !== String(blingId))) throw new Error("ID resolvido inconsistente na execução; refaça a comparação.");
        const codigo = codigoBling(fonteR.data);
        const atual = (await bl.get(`/produtos/${encodeURIComponent(blingId)}`))?.data;
        confirmarCodigo(atual, codigo, blingId);
        const frescas = comparar(fonte, atual, campos, ctx);
        const aplicar = frescas.filter((d) => camposSelecionados.includes(d.campo));
        const patch = montarPatch(aplicar, fonte, ctx, atual);
        let detalhe = atual;
        if (Object.keys(patch).length) {
          await bl.patch(`/produtos/${encodeURIComponent(blingId)}`, patch);
          detalhe = (await bl.get(`/produtos/${encodeURIComponent(blingId)}`))?.data;
        }
        if (!detalhe?.id) throw new Error("PATCH concluído, mas leitura de confirmação vazia.");
        confirmarCodigo(detalhe, codigo, blingId);
        const restantesBling = comparar(fonte, detalhe, campos, ctx).filter((i) => camposSelecionados.includes(i.campo));
        if (restantesBling.length) throw new Error(`Bling não confirmou os campos: ${restantesBling.map((i) => i.campo).join(", ")}`);
        fiscaisPreservados(atual, detalhe, camposSelecionados);
        const espelhoAviso = await espelho(blingId, detalhe, true);
        if (espelhoAviso) console.warn("Espelho Bling:", sku, espelhoAviso);
        check(await sb.from("bling_produto_sync_item").update({ status: "aplicado", erro: null, atualizado_em: agora() }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente").in("campo", camposSelecionados));
        const saldoR = await sb.from("bling_produto_sync_item").select("campo", { count: "exact", head: true }).eq("execucao_id", execucaoId).eq("sku", sku).neq("status", "aplicado"); check(saldoR);
        check(await sb.from("bling_produto_sync_produto").update({ status: saldoR.count ? "comparado" : "aplicado", erro: espelhoAviso }).eq("execucao_id", execucaoId).eq("sku", sku));
        resultados.push({ sku, bling_id: blingId, patch, status: "aplicado", espelho_aviso: espelhoAviso });
        const filaSku = fila.find((f) => f.sku === sku);
        if (filaSku) check(await sb.from("bling_produto_sync_fila").update({ status: "aplicado", execucao_id: execucaoId }).eq("sku", sku).eq("versao", filaSku.versao));
      } catch (e) {
        resultados.push({ sku, status: "erro", erro: msg(e) });
        check(await sb.from("bling_produto_sync_item").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku).eq("status", "pendente").in("campo", camposSelecionados));
        check(await sb.from("bling_produto_sync_produto").update({ status: "erro", erro: msg(e) }).eq("execucao_id", execucaoId).eq("sku", sku));
      }
    }
    const resumoR = await sb.rpc("fn_bling_produto_sync_resumo", { p_execucao: execucaoId }); check(resumoR);
    if (!resumoR.data.pendentes) check(await sb.from("bling_produto_sync_execucao").update({ status: "concluido", concluido_em: agora() }).eq("id", execucaoId));
    return json({ ok: true, execucao_id: execucaoId, concluido: !resumoR.data.pendentes, resumo: resumoR.data, resultados });
  } catch (e) { return json({ ok: false, erro: msg(e), execucao_id: execucaoId }, 500); }
  finally { if (locked) { const r = await sb.rpc("fn_bling_produto_sync_lease", { p_token: lease, p_liberar: true }); if (r.error) console.error("Liberar trava:", r.error.message); } }
});
