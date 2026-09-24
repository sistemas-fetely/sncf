// F3 Reformulação do Estoque (24/09/2026) — retrato do estoque no Bling (SÓ LEITURA).
// modo "retrato": GET /depositos → upsert bling_deposito (centro_id intocado — amarração é humana)
// + exemplo cru de /estoques/saldos de um produto, para conhecer o formato por depósito.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const log = async (status: string, registros: number, detalhes: unknown) => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "bling", tipo: "estoque_retrato", status,
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
  if (modo !== "retrato") return json({ ok: false, erro: `Modo desconhecido: ${modo}. Único modo: retrato.` }, 400);

  try {
    const { data: cfg, error: cfgErr } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (cfgErr) throw new Error(`Falha ao ler config do Bling: ${cfgErr.message}`);
    if (!cfg || !cfg.access_token) throw new Error("Bling não conectado");
    const client = makeBlingClient(supabase, cfg as any, await ensureFreshToken(supabase, cfg as any));

    // 1. Depósitos (paginado)
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

    // 2. Exemplo de saldo
    const { data: prod, error: pErr } = await supabase.from("bling_produtos_cache")
      .select("sku, bling_produto_id").not("bling_produto_id", "is", null).limit(1).maybeSingle();
    if (pErr) throw new Error(`bling_produtos_cache: ${pErr.message}`);
    let exemplo_saldo: unknown = null;
    if (prod?.bling_produto_id) {
      await sleep(THROTTLE_MS);
      const s = await client.get(`/estoques/saldos?idsProdutos[]=${prod.bling_produto_id}`);
      exemplo_saldo = { sku: prod.sku, bling_produto_id: prod.bling_produto_id, corpo: s };
    }

    const resp = { ok: true, depositos, exemplo_saldo };
    await log("sucesso", depositos.length, { depositos: depositos.length, exemplo_sku: prod?.sku ?? null });
    return json(resp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await log("erro", 0, { erro: msg });
    return json({ ok: false, erro: msg }, 500);
  }
});
