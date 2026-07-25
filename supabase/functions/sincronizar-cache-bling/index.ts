import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // dry_run via body (sem body = execução real)
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
    } catch (_) { /* run real */ }

    // 1. Cliente Bling — mesmo padrão do enviar-pedido-bling
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) return json(409, { error: "Bling não conectado" });
    const freshToken = await ensureFreshToken(supabase, cfg);
    const client = makeBlingClient(supabase, cfg, freshToken);

    // 2. Pagina TODO o catálogo do Bling
    const produtos: { sku: string; bling_produto_id: number; nome: string }[] = [];
    let pagina = 1;
    while (true) {
      const r = await client.get(`/produtos?limite=100&pagina=${pagina}`);
      const lote: any[] = r?.data ?? [];
      if (lote.length === 0) break;
      for (const p of lote) {
        const cod = String(p.codigo ?? "").trim(); // trima o tab/espaços do Bling
        if (!cod) continue;
        produtos.push({ sku: cod, bling_produto_id: Number(p.id), nome: String(p.nome ?? "") });
      }
      if (lote.length < 100) break;
      pagina++;
      if (pagina > 100) break; // guardrail anti-loop
    }

    // dedup por sku (mantém o último)
    const mapa = new Map<string, { sku: string; bling_produto_id: number; nome: string }>();
    for (const p of produtos) mapa.set(p.sku, p);
    const distintos = [...mapa.values()];

    // 3. Cobertura vs SNCF ativo
    const { data: ativos } = await supabase
      .from("sncf_produtos")
      .select("sku")
      .eq("ativo", true);
    const skusBling = new Set(distintos.map((p) => p.sku));
    const naoCasados = (ativos ?? [])
      .map((a: any) => a.sku)
      .filter((sku: string) => !skusBling.has(sku));

    const cobertura = {
      bling_total: produtos.length,
      bling_distintos: distintos.length,
      sncf_ativos: ativos?.length ?? 0,
      casados: (ativos?.length ?? 0) - naoCasados.length,
      nao_casados: naoCasados.length,
      exemplos_nao_casados: naoCasados.slice(0, 30),
    };

    if (dryRun) return json(200, { dry_run: true, ...cobertura });

    // 4. Upsert real na cache (idempotente)
    const linhas = distintos.map((p) => ({
      sku: p.sku,
      bling_produto_id: p.bling_produto_id,
      nome: p.nome,
      atualizado_em: new Date().toISOString(),
    }));
    const { error: upErr } = await supabase
      .from("bling_produtos_cache")
      .upsert(linhas, { onConflict: "sku" });
    if (upErr) throw new Error(`Falha no upsert da cache: ${upErr.message}`);

    // Reconcilia o espelho produtos: desativa linhas cujo bling_id sumiu do Bling
    const { data: reconciliados, error: recErr } = await supabase.rpc("reconciliar_produtos_espelho");
    if (recErr) throw new Error(`Falha na reconciliação do espelho: ${recErr.message}`);

    return json(200, { dry_run: false, upserted: linhas.length, produtos_reconciliados: reconciliados, ...cobertura });
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
});
