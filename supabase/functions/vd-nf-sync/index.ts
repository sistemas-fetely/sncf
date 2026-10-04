// Sync dirigido das NFs da venda direta: relê no Bling a NF de cada pedido VD em
// pre_faturamento/faturado, sem esperar a varredura do sync-nfe dar a volta.
// Acesso: somente cron (x-cron-secret = vault SYNC_CRON_SECRET). FAIL-CLOSED.
// Os gatilhos de nfs_emitidas (ligação, roteamento para a Mesa SP) fazem o resto.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureFreshToken, makeBlingClient, type BlingConfig } from "../_shared/bling/bling-client.ts";
import { sincronizarNfePorId } from "../_shared/bling/nfe-item.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-cron-secret` };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAUSA_MS = 350; // ~3 req/s do Bling

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret) return json({ ok: false, erro: "Não autorizado: x-cron-secret ausente." }, 401);
  const { data: esperado, error: eVault } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  if (eVault || !esperado) return json({ ok: false, erro: "Não foi possível validar o x-cron-secret." }, 401);
  if (cronSecret !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);

  try {
    const { data: pedidos, error: ePed } = await sb.from("pedidos")
      .select("id, id_externo")
      .eq("origem", "venda_direta")
      .is("cancelado_em", null)
      .in("estagio", ["pre_faturamento", "faturado"]);
    if (ePed) throw new Error(`ler pedidos: ${ePed.message}`);
    const ids = (pedidos ?? []).map((p: any) => p.id);
    if (ids.length === 0) return json({ ok: true, alvos: 0, sincronizadas: 0, sem_nf: 0, erros: [] });

    const { data: filas, error: eFila } = await sb.from("bling_pedido_fila_b2c")
      .select("pedido_id, bling_pedido_id")
      .in("pedido_id", ids).eq("status", "enviado").not("bling_pedido_id", "is", null);
    if (eFila) throw new Error(`ler fila b2c: ${eFila.message}`);
    const blingPedido = new Map<string, string>();
    for (const f of filas ?? []) if (f.pedido_id && f.bling_pedido_id) blingPedido.set(f.pedido_id, String(f.bling_pedido_id));

    const alvos = (pedidos ?? []).filter((p: any) => blingPedido.has(p.id));
    if (alvos.length === 0) return json({ ok: true, alvos: 0, sincronizadas: 0, sem_nf: 0, erros: [] });

    const { data: nfs, error: eNf } = await sb.from("nfs_emitidas")
      .select("pedido_venda_id, bling_id")
      .in("pedido_venda_id", alvos.map((p: any) => p.id)).not("bling_id", "is", null);
    if (eNf) throw new Error(`ler nfs_emitidas: ${eNf.message}`);
    const nfDoPedido = new Map<string, string>();
    for (const n of nfs ?? []) if (n.pedido_venda_id && n.bling_id) nfDoPedido.set(n.pedido_venda_id, String(n.bling_id));

    const { data: cfgData, error: eCfg } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (eCfg) throw new Error(`config bling: ${eCfg.message}`);
    if (!cfgData?.access_token) throw new Error("Bling não conectado.");
    const cfg = cfgData as BlingConfig;
    const client = makeBlingClient(sb, cfg, await ensureFreshToken(sb, cfg));

    let sincronizadas = 0, semNf = 0;
    const erros: Array<{ pedido: string; erro: string }> = [];

    for (const p of alvos) {
      try {
        let nfId = nfDoPedido.get(p.id) ?? null;
        if (!nfId) {
          const ped = await client.get(`/pedidos/vendas/${encodeURIComponent(blingPedido.get(p.id)!)}`);
          const n = ped?.data?.notaFiscal?.id;
          nfId = n != null && String(n) !== "0" ? String(n) : null;
          await sleep(PAUSA_MS);
        }
        if (!nfId) { semNf++; continue; }
        await sincronizarNfePorId(sb, client, nfId);
        sincronizadas++;
      } catch (e) {
        erros.push({ pedido: p.id_externo ?? p.id, erro: e instanceof Error ? e.message : String(e) });
      }
      await sleep(PAUSA_MS);
    }

    return json({ ok: true, alvos: alvos.length, sincronizadas, sem_nf: semNf, erros });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
