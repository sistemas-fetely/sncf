// F3 Reformulação do Estoque (24/09/2026) — retrato do estoque no Bling (SÓ LEITURA).
// modo "retrato": GET /depositos → upsert bling_deposito (centro_id intocado — amarração é humana)
// + exemplo cru de /estoques/saldos de um produto, para conhecer o formato por depósito.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient, BLING_BASE } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const TETO_PUSH = 300;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const log = async (status: string, registros: number, detalhes: unknown, tipo = "estoque_retrato") => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "bling", tipo, status,
      registros_atualizados: registros, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify(detalhes),
    });
    if (error) console.error("log:", error.message);
  };

  // Auth: x-cron-secret OU sessão válida
  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data: esperado } = await supabase.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (!esperado || cron !== String(esperado)) return json({ ok: false, erro: "x-cron-secret inválido" }, 401);
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: u, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (uErr || !u.user) return json({ ok: false, erro: "Não autorizado" }, 401);
  }

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* sem body */ }
  const modo = body?.modo ?? "retrato";
  if (!["retrato", "carga_saldos", "push", "deposito_considerar_saldo"].includes(modo)) {
    return json({ ok: false, erro: `Modo desconhecido: ${modo}. Modos: retrato, carga_saldos, push, deposito_considerar_saldo.` }, 400);
  }
  const tipoLog = modo === "retrato" ? "estoque_retrato" : modo === "carga_saldos" ? "estoque_carga_saldos"
    : modo === "deposito_considerar_saldo" ? "estoque_deposito_config" : "estoque_push";

  const abrirCliente = async () => {
    const { data: cfg, error: cfgErr } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (cfgErr) throw new Error(`Falha ao ler config do Bling: ${cfgErr.message}`);
    if (!cfg || !cfg.access_token) throw new Error("Bling não conectado");
    return makeBlingClient(supabase, cfg as any, await ensureFreshToken(supabase, cfg as any));
  };

  const dryRun = body?.dry_run === false ? false : true;

  try {
    // ---------- DEPÓSITO: CONSIDERAR SALDO ----------
    // O PUT /depositos/{id} do Bling substitui o objeto inteiro: SEMPRE GET antes.
    if (modo === "deposito_considerar_saldo") {
      const depId = Number(body?.deposito_id);
      if (!Number.isFinite(depId) || depId <= 0) return json({ ok: false, erro: "deposito_id obrigatório (número)." }, 400);
      const { data: dep, error: dErr } = await supabase.from("bling_deposito")
        .select("deposito_id, descricao, centro_id").eq("deposito_id", depId).maybeSingle();
      if (dErr) throw new Error(`bling_deposito: ${dErr.message}`);
      if (!dep) return json({ ok: false, erro: `Depósito ${depId} não existe em bling_deposito.` }, 400);
      if (!dep.centro_id) return json({ ok: false, erro: `Depósito ${depId} (${dep.descricao}) não está amarrado a um centro (centro_id vazio).` }, 400);
      const client = await abrirCliente();
      const g: any = await client.get(`/depositos/${depId}`);
      const atual = g?.data ?? g;
      const mudaria = { campo: "desconsiderarSaldo", atual: atual?.desconsiderarSaldo ?? null, novo: false };
      if (dryRun) return json({ ok: true, dry_run: true, deposito: atual, mudaria });
      const novo = { ...atual, desconsiderarSaldo: false };
      const res = await fetch(`${BLING_BASE}/depositos/${depId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${client.currentToken()}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(novo),
      });
      if (!res.ok) throw new Error(`Bling PUT /depositos/${depId} ${res.status}: ${(await res.text()).slice(0, 800)}`);
      await sleep(THROTTLE_MS);
      const pos: any = await client.get(`/depositos/${depId}`);
      const depois = pos?.data ?? pos;
      await log("sucesso", 1, { deposito_id: depId, antes: mudaria.atual, depois: depois?.desconsiderarSaldo }, tipoLog);
      return json({ ok: true, deposito: depois });
    }

    // ---------- PUSH ----------
    if (modo === "push") {
      const skus: string[] = Array.isArray(body?.skus)
        ? [...new Set<string>(body.skus.map((x: unknown) => String(x).trim()).filter(Boolean))]
        : [];
      const limitePresente = body?.limite != null;
      const limiteNum = Number(body?.limite);
      if (limitePresente && (!Number.isFinite(limiteNum) || limiteNum < 1 || limiteNum > TETO_PUSH)) {
        return json({ ok: false, erro: `limite deve estar entre 1 e ${TETO_PUSH}.` }, 400);
      }
      const limite = limitePresente ? Math.trunc(limiteNum) : null;
      let q = supabase.from("vw_estoque_bling_sync")
        .select("sku, bling_produto_id, deposito_id, bling_atual, sncf_disponivel, diff, centro")
        .neq("diff", 0).order("sku");
      if (skus.length) q = q.in("sku", skus);
      const { data: linhasView, error: vErr } = await q;
      if (vErr) throw new Error(`vw_estoque_bling_sync: ${vErr.message}`);
      const linhas = linhasView ?? [];
      const processar = limite != null ? linhas.slice(0, limite) : linhas;
      const restantes = limite != null ? linhas.length - processar.length : 0;

      if (dryRun) {
        return json({
          ok: true, dry_run: true, total_mudariam: processar.length, restantes,
          exemplos: processar.slice(0, 20).map((r: any) => ({
            sku: r.sku, deposito_id: r.deposito_id, bling_atual: r.bling_atual, sncf_disponivel: r.sncf_disponivel, diff: r.diff,
          })),
        });
      }
      if (limite == null && linhas.length > TETO_PUSH) {
        throw new Error(`Teto de ${TETO_PUSH} linhas por chamada (a view tem ${linhas.length}). Filtre por skus ou use limite.`);
      }
      const client = await abrirCliente();
      let empurrados = 0;
      const falhas: any[] = [];
      for (let k = 0; k < processar.length; k++) {
        const r: any = processar[k];
        if (k > 0) await sleep(THROTTLE_MS);
        const quantidade = Math.trunc(Number(r.sncf_disponivel));
        try {
          await client.post("/estoques", {
            deposito: { id: Number(r.deposito_id) }, produto: { id: Number(r.bling_produto_id) },
            operacao: "B", quantidade,
          });
        } catch (e) {
          falhas.push({ sku: r.sku, deposito_id: r.deposito_id, quantidade, erro: e instanceof Error ? e.message : String(e) });
          continue;
        }
        empurrados++;
        const { error: uErr } = await supabase.from("bling_estoque_saldo").upsert({
          bling_produto_id: r.bling_produto_id, deposito_id: r.deposito_id, sku: r.sku,
          saldo_fisico: quantidade, saldo_virtual: quantidade, atualizado_em: new Date().toISOString(),
        }, { onConflict: "bling_produto_id,deposito_id" });
        if (uErr) falhas.push({ sku: r.sku, deposito_id: r.deposito_id, quantidade, erro: `Bling aceitou, espelho falhou: ${uErr.message}` });
      }
      await log(falhas.length ? (empurrados ? "parcial" : "erro") : "sucesso", empurrados, { empurrados, falhas, restantes }, tipoLog);
      return json({ ok: falhas.length === 0, empurrados, falhas, restantes });
    }

    const client = await abrirCliente();

    // ---------- CARGA DE SALDOS ----------
    if (modo === "carga_saldos") {
      const cache: { sku: string; bling_produto_id: any }[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from("bling_produtos_cache")
          .select("sku, bling_produto_id").not("bling_produto_id", "is", null)
          .order("bling_produto_id").range(de, de + 999);
        if (error) throw new Error(`bling_produtos_cache: ${error.message}`);
        cache.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const skuPorId = new Map<string, string>();
      for (const c of cache) if (!skuPorId.has(String(c.bling_produto_id))) skuPorId.set(String(c.bling_produto_id), c.sku);
      const ids = [...skuPorId.keys()];
      let produtos = 0, linhas = 0;
      const agora = new Date().toISOString();
      for (let k = 0; k < ids.length; k += 40) {
        if (k > 0) await sleep(THROTTLE_MS);
        const lote = ids.slice(k, k + 40);
        const qs = lote.map((id) => `idsProdutos[]=${encodeURIComponent(id)}`).join("&");
        const r: any = await client.get(`/estoques/saldos?${qs}`);
        const rows: any[] = [];
        for (const p of r?.data ?? []) {
          const pid = p?.produto?.id;
          if (pid == null) continue;
          produtos++;
          for (const d of p.depositos ?? []) {
            rows.push({
              bling_produto_id: pid, deposito_id: d.id, sku: skuPorId.get(String(pid)) ?? p.produto.codigo ?? null,
              saldo_fisico: d.saldoFisico ?? null, saldo_virtual: d.saldoVirtual ?? null, atualizado_em: agora,
            });
          }
        }
        if (rows.length) {
          const { error } = await supabase.from("bling_estoque_saldo").upsert(rows, { onConflict: "bling_produto_id,deposito_id" });
          if (error) throw new Error(`bling_estoque_saldo (lote ${k / 40 + 1}): ${error.message}`);
          linhas += rows.length;
        }
      }
      await log("sucesso", linhas, { produtos, linhas, ids_consultados: ids.length }, tipoLog);
      return json({ ok: true, produtos, linhas });
    }

    // ---------- RETRATO ----------
    const depositos: any[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      if (pagina > 1) await sleep(THROTTLE_MS);
      const r: any = await client.get(`/depositos?pagina=${pagina}&limite=100`);
      const lote: any[] = r?.data ?? [];
      depositos.push(...lote);
      if (lote.length < 100) break;
    }
    const agora = new Date().toISOString();
    if (depositos.length) {
      const linhas = depositos.map((d) => ({
        deposito_id: d.id, descricao: d.descricao ?? null,
        padrao: d.padrao ?? null, situacao: d.situacao ?? null, atualizado_em: agora,
      }));
      const { error } = await supabase.from("bling_deposito").upsert(linhas, { onConflict: "deposito_id" });
      if (error) throw new Error(`bling_deposito: ${error.message}`);
    }
    const { data: prod, error: pErr } = await supabase.from("bling_produtos_cache")
      .select("sku, bling_produto_id").not("bling_produto_id", "is", null).limit(1).maybeSingle();
    if (pErr) throw new Error(`bling_produtos_cache: ${pErr.message}`);
    let exemplo_saldo: unknown = null;
    if (prod?.bling_produto_id) {
      await sleep(THROTTLE_MS);
      const s = await client.get(`/estoques/saldos?idsProdutos[]=${prod.bling_produto_id}`);
      exemplo_saldo = { sku: prod.sku, bling_produto_id: prod.bling_produto_id, corpo: s };
    }
    await log("sucesso", depositos.length, { depositos: depositos.length, exemplo_sku: prod?.sku ?? null }, tipoLog);
    return json({ ok: true, depositos, exemplo_saldo });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!((modo === "push" || modo === "deposito_considerar_saldo") && dryRun)) await log("erro", 0, { erro: msg }, tipoLog);
    return json({ ok: false, erro: msg }, 500);
  }
});
