/**
 * cte-xml-backfill — reprocessa os XMLs de CT-e já guardados no bucket `nfs-stage`
 * pela RPC fn_cte_xml_registrar (origem 'backfill'). Administrativa: só service role
 * ou x-cron-secret (SYNC_CRON_SECRET no vault).
 *
 * Body: { dry_run: boolean, lote: string }
 * Fonte: chaves de nfs_stage com tipo_documento='cte' cujo objeto no bucket contém
 * a chave de 44 dígitos e termina em .xml. Uma chamada por chave (dedup); arquivo
 * que não é XML de verdade vira linha de erro pela própria RPC.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const BUCKET = "nfs-stage";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sb = createClient(url, serviceKey);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!(serviceKey && token === serviceKey)) {
      const cron = req.headers.get("x-cron-secret");
      if (!cron) return json({ ok: false, error: "Não autorizado (service role ou x-cron-secret)." }, 401);
      const { data: seg, error: eSeg } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (eSeg || !seg || seg !== cron) return json({ ok: false, error: "Credencial de máquina inválida." }, 403);
    }

    let body: any = null;
    try { body = await req.json(); } catch { /* validado abaixo */ }
    if (typeof body?.dry_run !== "boolean") return json({ ok: false, error: "dry_run (boolean) é obrigatório." }, 400);
    if (typeof body?.lote !== "string" || body.lote.trim().length < 3 || body.lote.length > 120) {
      return json({ ok: false, error: "lote (texto de 3 a 120 caracteres) é obrigatório." }, 400);
    }
    const dryRun: boolean = body.dry_run;
    const lote: string = body.lote.trim();

    // Chaves de CT-e no stage
    const chavesCte = new Set<string>();
    for (let de = 0; ; de += 1000) {
      const { data, error } = await sb.from("nfs_stage").select("nf_chave_acesso")
        .eq("tipo_documento", "cte").range(de, de + 999);
      if (error) throw new Error(`nfs_stage: ${error.message}`);
      for (const r of data ?? []) if (r.nf_chave_acesso) chavesCte.add(r.nf_chave_acesso);
      if (!data || data.length < 1000) break;
    }

    // Lista o bucket (pastas de primeiro nível + raiz)
    const listar = async (prefixo: string) => {
      const out: { name: string; isFolder: boolean }[] = [];
      for (let off = 0; ; off += 1000) {
        const { data, error } = await sb.storage.from(BUCKET).list(prefixo, { limit: 1000, offset: off, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`storage list '${prefixo}': ${error.message}`);
        for (const o of data ?? []) out.push({ name: prefixo ? `${prefixo}/${o.name}` : o.name, isFolder: o.id === null });
        if (!data || data.length < 1000) break;
      }
      return out;
    };
    const objetos: string[] = [];
    const fila = [""];
    while (fila.length) {
      const p = fila.shift()!;
      for (const o of await listar(p)) (o.isFolder ? fila.push(o.name) : objetos.push(o.name));
    }

    // Dedup pela chave: primeiro objeto (ordem alfabética) de cada chave
    const porChave = new Map<string, string>();
    for (const nome of objetos.sort()) {
      if (!nome.toLowerCase().endsWith(".xml")) continue;
      const ch = nome.match(/\d{44}/)?.[0];
      if (ch && chavesCte.has(ch) && !porChave.has(ch)) porChave.set(ch, nome);
    }

    const por_status: Record<string, number> = {};
    const por_transportadora: Record<string, number> = {};
    const erros: { chave: string; arquivo: string; erro: string }[] = [];
    const conta = (m: Record<string, number>, k: string) => (m[k] = (m[k] ?? 0) + 1);

    for (const [chave, nome] of porChave) {
      let xml = "";
      try {
        const { data: blob, error } = await sb.storage.from(BUCKET).download(nome);
        if (error || !blob) throw new Error(error?.message ?? "download vazio");
        xml = await blob.text();
      } catch (e) {
        conta(por_status, "erro_download");
        erros.push({ chave, arquivo: nome, erro: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const { data: r, error } = await sb.rpc("fn_cte_xml_registrar", {
        p_xml: xml, p_origem: "backfill", p_arquivo: nome, p_lote: lote, p_dry_run: dryRun,
      });
      const st = error ? "erro" : String((r as any)?.status ?? "erro");
      conta(por_status, st);
      conta(por_transportadora, (r as any)?.transportadora ?? "(não identificada)");
      if (st === "erro") erros.push({ chave, arquivo: nome, erro: error?.message ?? (r as any)?.erro ?? "sem retorno" });
    }

    return json({
      ok: true, lote, dry_run: dryRun,
      total: porChave.size, chaves_cte_no_stage: chavesCte.size, objetos_no_bucket: objetos.length,
      por_status, por_transportadora, erros: erros.slice(0, 50),
    });
  } catch (e) {
    console.error("[cte-xml-backfill]", e);
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
