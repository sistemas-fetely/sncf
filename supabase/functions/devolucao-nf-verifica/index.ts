// Verificação automática das NFs de devolução em rascunho (03/11/2026, DEV-NF-VERIFICA-AUTO).
// Cron devolucao-nf-verifica-15min. Mesma regra do botão (_shared/devolucao/verificar-nf-dev.ts).
// Idempotente: só pega nf_dev_status='rascunho'; limite por rodada e pausa entre chamadas ao Bling.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { verificarNfDevolucao } from "../_shared/devolucao/verificar-nf-dev.ts";

const LIMITE = 40;
const PAUSA_MS = 400; // Bling: 3 req/s
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, db, corsHeaders);
  if (negado) return negado;
  try {
    const { data: fila, error } = await db.from("devolucao")
      .select("id,numero,nf_dev_numero,nf_dev_bling_id")
      .eq("nf_dev_status", "rascunho").not("nf_dev_bling_id", "is", null)
      .order("nf_dev_atualizado_em", { ascending: true }).limit(LIMITE);
    if (error) throw error;
    if (!fila?.length) return json({ ok: true, tratadas: 0, itens: [] });
    const { data: cfg, error: ce } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (ce) throw ce;
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
    const itens: any[] = [];
    for (const d of fila) {
      try {
        const r = await verificarNfDevolucao(db, bling, d.id);
        itens.push({ devolucao: d.numero, nf: d.nf_dev_numero, ...r });
      } catch (e) {
        console.error(`devolucao-nf-verifica ${d.numero}:`, msg(e));
        itens.push({ devolucao: d.numero, nf: d.nf_dev_numero, resultado: "falha", erro: msg(e) });
      }
      await new Promise((r) => setTimeout(r, PAUSA_MS));
    }
    console.log("devolucao-nf-verifica", JSON.stringify(itens));
    return json({ ok: true, tratadas: itens.length, itens });
  } catch (e) {
    console.error("devolucao-nf-verifica:", msg(e));
    return json({ ok: false, erro: msg(e) }, 500);
  }
});
