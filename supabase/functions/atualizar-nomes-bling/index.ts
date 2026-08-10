// F6b — OPERACIONAL-DERIVA-DO-COMERCIAL.
// Empurra sncf_produtos.nome_operacional para o campo `nome` do cadastro no Bling,
// que e o texto que aparece na linha do pedido de venda e na NF.
// SEMPRE GET antes do PUT: o PUT do Bling substitui o cadastro inteiro, e montar
// o payload sem o objeto atual apagaria tributacao/NCM/GTIN/dimensoes do produto.
// dry_run e o default. So escreve com dry_run explicitamente false.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient, BLING_BASE } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE_MS = 350;
const LIMITE_DEFAULT = 25;
const LIMITE_MAX = 100;
const NOME_MAX = 120;
// Orçamento de tempo: o runtime corta em 150s de idle. Paramos antes e devolvemos parcial.
const BUDGET_MS = 110_000;


type Item = {
  sku: string;
  bling_id: string;
  nome_atual: string | null;
  nome_novo: string | null;
  status: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ ok: false, erro: "Não autorizado" }, 401);

    // ---- body ----
    let skus: string[] = [];
    let limite = LIMITE_DEFAULT;
    let dryRun = true;
    try {
      const body = await req.json();
      if (Array.isArray(body?.skus)) {
        skus = body.skus.map((s: unknown) => String(s).trim()).filter(Boolean);
      }
      const l = Number(body?.limite);
      if (Number.isFinite(l) && l > 0) limite = Math.min(Math.floor(l), LIMITE_MAX);
      dryRun = body?.dry_run === false ? false : true;
    } catch (_) { /* sem body = dry run com default */ }

    // ---- candidatos ----
    // Sem skus explícitos: a view vw_nome_bling_fila já entrega só quem falta
    // (ativo, tipo P, formato S, bling_id, tem ficha, nome válido e SEM push bem-sucedido).
    // A fila só desce: quem já teve push OK nunca volta.
    const fichas = new Map<string, string | null>();
    let fila: any[] = [];

    if (skus.length === 0) {
      const { data: rows, error: filaErr } = await supabase
        .from("vw_nome_bling_fila")
        .select("codigo, bling_id, nome_espelho, nome_operacional")
        .order("codigo")
        .limit(limite);
      if (filaErr) return json({ ok: false, erro: `Falha ao ler vw_nome_bling_fila: ${filaErr.message}` }, 500);
      fila = (rows || []).map((r: any) => ({
        codigo: r.codigo,
        bling_id: r.bling_id,
        nome: r.nome_espelho ?? null,
      }));
      for (const r of rows || []) fichas.set(r.codigo, r.nome_operacional ?? null);
    } else {
      // escape hatch: reprocessa SKU específico mesmo já empurrado
      const { data: prods, error: prodErr } = await supabase
        .from("produtos")
        .select("codigo, nome, bling_id")
        .not("bling_id", "is", null)
        .eq("ativo", true)
        .eq("tipo_bling", "P")
        .eq("formato_bling", "S")
        .in("codigo", skus)
        .order("codigo")
        .limit(Math.max(skus.length, limite));
      if (prodErr) return json({ ok: false, erro: `Falha ao ler produtos: ${prodErr.message}` }, 500);

      const codigos = (prods || []).map((p: any) => p.codigo).filter(Boolean);
      for (let i = 0; i < codigos.length; i += 200) {
        const chunk = codigos.slice(i, i + 200);
        const { data: fs, error: fErr } = await supabase
          .from("sncf_produtos")
          .select("sku, nome_operacional")
          .in("sku", chunk);
        if (fErr) return json({ ok: false, erro: `Falha ao ler sncf_produtos: ${fErr.message}` }, 500);
        for (const f of fs || []) fichas.set(f.sku, f.nome_operacional ?? null);
      }

      // guardrails avaliados no laço (com log)
      fila = (prods || []).filter((p: any) => fichas.has(p.codigo)).slice(0, Math.max(skus.length, limite));
    }

    const itens: Item[] = [];
    let sucesso = 0;
    let falhas = 0;
    let pulados = 0;
    let processados = 0;
    let interrompidoPorTempo = false;
    const inicio = Date.now();


    // grava log e falha em voz alta
    async function logar(row: Record<string, unknown>) {
      const { error } = await supabase.from("bling_nome_log").insert(row);
      if (error) throw new Error(`Falha ao gravar bling_nome_log: ${error.message}`);
    }

    let client: ReturnType<typeof makeBlingClient> | null = null;
    if (fila.length > 0) {
      const { data: cfg, error: cfgErr } = await supabase
        .from("integracoes_config")
        .select("*")
        .eq("sistema", "bling")
        .maybeSingle();
      if (cfgErr) return json({ ok: false, erro: `Falha ao ler config do Bling: ${cfgErr.message}` }, 500);
      if (!cfg || !cfg.access_token) return json({ ok: false, erro: "Bling não conectado" }, 409);
      try {
        const fresh = await ensureFreshToken(supabase, cfg as any);
        client = makeBlingClient(supabase, cfg as any, fresh);
      } catch (e) {
        return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 401);
      }
    }

    for (let i = 0; i < fila.length; i++) {
      if (Date.now() - inicio > BUDGET_MS) {
        interrompidoPorTempo = true;
        break;
      }
      const p: any = fila[i];
      const blingId = String(p.bling_id);
      const nomeNovo = (fichas.get(p.codigo) ?? "").trim();


      // guardrails (com log, para skus explícitos)
      if (!nomeNovo || nomeNovo.length > NOME_MAX) {
        pulados++;
        const motivo = !nomeNovo ? "nome_operacional vazio" : `nome_operacional > ${NOME_MAX} caracteres`;
        itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: p.nome ?? null, nome_novo: nomeNovo || null, status: `pulado: ${motivo}` });
        await logar({ sku: p.codigo, bling_id: blingId, nome_antes: p.nome ?? null, nome_depois: nomeNovo || null, sucesso: false, erro_msg: motivo, dry_run: dryRun });
        continue;
      }

      if (i > 0) await sleep(THROTTLE_MS);

      // 1) GET obrigatório — objeto completo e atual
      let atual: any = null;
      let getErro = "";
      try {
        const r = await client!.get(`/produtos/${blingId}`);
        atual = r?.data ?? null;
      } catch (e) {
        getErro = e instanceof Error ? e.message : String(e);
      }
      if (!atual || !atual.id) {
        falhas++;
        processados++;
        const msg = getErro || "GET /produtos retornou vazio ou sem id";
        itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: null, nome_novo: nomeNovo, status: `erro no GET: ${msg}` });
        await logar({ sku: p.codigo, bling_id: blingId, nome_antes: p.nome ?? null, nome_depois: nomeNovo, sucesso: false, erro_msg: msg, dry_run: dryRun });
        continue;
      }

      const nomeAtual = typeof atual.nome === "string" ? atual.nome : null;

      // nome já correto no Bling: não gasta PUT
      if ((nomeAtual ?? "").trim() === nomeNovo) {
        pulados++;
        itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: nomeAtual, nome_novo: nomeNovo, status: "pulado: nome já igual no Bling" });
        await logar({ sku: p.codigo, bling_id: blingId, nome_antes: nomeAtual, nome_depois: nomeNovo, sucesso: true, erro_msg: "nome já igual no Bling", dry_run: dryRun });
        continue;
      }

      if (dryRun) {
        processados++;
        itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: nomeAtual, nome_novo: nomeNovo, status: "dry_run" });
        await logar({ sku: p.codigo, bling_id: blingId, nome_antes: nomeAtual, nome_depois: nomeNovo, sucesso: true, dry_run: true });
        continue;
      }

      // 3) clone do objeto atual, alterando SOMENTE o nome
      const payload = { ...atual, nome: nomeNovo };

      // 4) PUT com o objeto completo
      let status = 0;
      let putErro = "";
      try {
        const res = await fetch(`${BLING_BASE}/produtos/${blingId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${client!.currentToken()}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        status = res.status;
        if (!res.ok) putErro = `Bling PUT ${status}: ${(await res.text()).slice(0, 500)}`;
      } catch (e) {
        putErro = e instanceof Error ? e.message : String(e);
      }

      processados++;
      if (putErro) {
        falhas++;
        itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: nomeAtual, nome_novo: nomeNovo, status: `erro no PUT: ${putErro}` });
        await logar({ sku: p.codigo, bling_id: blingId, nome_antes: nomeAtual, nome_depois: nomeNovo, sucesso: false, resposta_status: status || null, erro_msg: putErro, dry_run: false });
        continue;
      }

      sucesso++;
      itens.push({ sku: p.codigo, bling_id: blingId, nome_atual: nomeAtual, nome_novo: nomeNovo, status: "atualizado" });
      await logar({ sku: p.codigo, bling_id: blingId, nome_antes: nomeAtual, nome_depois: nomeNovo, sucesso: true, resposta_status: status, dry_run: false });
    }

    return json({
      ok: true,
      dry_run: dryRun,
      candidatos: fila.length,
      processados,
      sucesso,
      falhas,
      pulados,
      interrompido_por_tempo: interrompidoPorTempo,
      restantes: interrompidoPorTempo ? fila.length - (sucesso + falhas + pulados) : 0,
      itens,
    });

  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
