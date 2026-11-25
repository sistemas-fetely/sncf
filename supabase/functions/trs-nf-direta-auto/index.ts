// TRS-FISICA-NF-DIRETA (25/11/2026): rotina que gera a NF direta das TRS físicas conferidas pela XPM.
// Idempotente: trs-fiscal-gerar-nf faz o claim e recusa duplicidade. Limite por rodada e pausa entre chamadas.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";

const LIMITE = 10;
const PAUSA_MS = 400;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, service);
  const negado = await gateCronOuSessao(req, db, corsHeaders);
  if (negado) return negado;
  try {
    const { data: nats, error: ne } = await db.from("naturezas_operacao").select("id").eq("familia_processo", "transferencia").eq("exige_expedicao", true);
    if (ne) throw ne;
    const { data: dims, error: de } = await db.from("natureza_nf_direta").select("natureza_operacao_id,transmite_automatico").eq("gera_nf_direta", true).in("natureza_operacao_id", (nats ?? []).map((n: any) => n.id));
    if (de) throw de;
    if (!dims?.length) return json({ ok: true, processados: 0, itens: [] });
    const transmite = new Map(dims.map((d: any) => [d.natureza_operacao_id, d.transmite_automatico === true]));
    const { data: pedidos, error: pe } = await db.from("pedidos").select("id,id_externo,natureza_operacao_id")
      .in("natureza_operacao_id", [...transmite.keys()]).eq("estagio", "pre_faturamento")
      .is("bling_id_destino", null).is("cancelado_em", null).order("criado_em", { ascending: true }).limit(200);
    if (pe) throw pe;
    const ids = (pedidos ?? []).map((p: any) => p.id);
    const { data: regs, error: re } = ids.length ? await db.from("trs_nf_direta").select("pedido_id,status,tentativas").in("pedido_id", ids) : { data: [], error: null };
    if (re) throw re;
    const reg = new Map((regs ?? []).map((r: any) => [r.pedido_id, r]));
    const fila = (pedidos ?? []).filter((p: any) => {
      const r: any = reg.get(p.id);
      if (!r) return true;
      if (r.status === "erro") return Number(r.tentativas ?? 0) < 5;
      return r.status === "rascunho" && transmite.get(p.natureza_operacao_id) === true;
    }).slice(0, LIMITE);
    const itens: any[] = [];
    for (const [i, p] of fila.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, PAUSA_MS));
      try {
        const r = await fetch(`${url}/functions/v1/trs-fiscal-gerar-nf`, { method: "POST", headers: { Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ pedido_id: p.id }) });
        const corpo = await r.json().catch(() => ({}));
        itens.push({ trs: p.id_externo, pedido_id: p.id, status: r.status, ...corpo });
      } catch (e) { itens.push({ trs: p.id_externo, pedido_id: p.id, ok: false, erro: msg(e) }); }
    }
    const out = { ok: true, processados: itens.length, itens };
    console.log(JSON.stringify(out));
    return json(out);
  } catch (e) { console.error(msg(e)); return json({ ok: false, erro: msg(e) }, 500); }
});
