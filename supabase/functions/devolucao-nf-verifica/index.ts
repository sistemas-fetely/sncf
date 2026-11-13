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

// DEV-TRS-AUTO (03/11/2026): TRS de retorno de devolução. (a) devolução que ainda não tem TRS → cria
// (fn_devolucao_criar_trs_retorno, idempotente); (b) TRS com natureza fiscal ligada e ainda fora do Bling →
// envio pelo enviar-pedido-bling em modo sistema. Sem natureza (CFOP) ligada nada vai ao Bling.
const LIMITE_TRS = 10;
async function tratarTrsRetorno(db: any): Promise<any[]> {
  const out: any[] = [];
  const { data: pend, error } = await db.from("vw_devolucao_trs_retorno")
    .select("devolucao_id,numero,trs_pedido_id,trs_numero,situacao")
    .in("situacao", ["sem_trs", "aguardando_envio", "erro_envio", "rascunho"]).order("desde", { ascending: true }).limit(LIMITE_TRS);
  if (error) return [{ resultado: "falha", erro: `ler vw_devolucao_trs_retorno: ${error.message}` }];
  if (!pend?.length) return out;
  let segredo: string | null = null;
  for (const p of pend) {
    try {
      if (p.situacao === "sem_trs") {
        const { data, error: e } = await db.rpc("fn_devolucao_criar_trs_retorno", { p_devolucao_id: p.devolucao_id });
        if (e) throw e;
        out.push({ devolucao: p.numero, acao: "criar_trs", ...(data ?? {}) });
        continue;
      }
      const { data: trs, error: trsErro } = await db.from("pedidos").select("natureza_operacao_id").eq("id", p.trs_pedido_id).single();
      if (trsErro) throw trsErro;
      const { data: direta, error: diretaErro } = await db.from("natureza_nf_direta").select("gera_nf_direta,transmite_automatico").eq("natureza_operacao_id", trs.natureza_operacao_id).maybeSingle();
      if (diretaErro) throw diretaErro;
      const nfDireta = direta?.gera_nf_direta === true;
      if (p.situacao === "rascunho" && (!nfDireta || direta?.transmite_automatico !== true)) continue;
      // Erro reprocessável novo pertence apenas à NF direta; fluxo legado intacto.
      if (p.situacao === "erro_envio" && !nfDireta) continue;
      if (!nfDireta && !segredo) {
        const { data: s, error: se } = await db.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
        if (se || !s) throw new Error("SYNC_CRON_SECRET indisponível no cofre");
        segredo = String(s);
      }
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${nfDireta ? "trs-fiscal-gerar-nf" : "enviar-pedido-bling"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(!nfDireta && segredo ? { "x-cron-secret": segredo } : {}),
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify(nfDireta ? { pedido_id: p.trs_pedido_id } : { pedido_id: p.trs_pedido_id, trs_retorno_devolucao_id: p.devolucao_id }),
      });
      const j: any = await r.json().catch(() => ({}));
      out.push({ devolucao: p.numero, trs: p.trs_numero, acao: nfDireta ? "gerar_nf_direta" : "enviar_bling", http: r.status,
        ok: r.ok && j?.sucesso !== false && j?.ok !== false, erro: r.ok ? undefined : (j?.erro ?? j?.error ?? `HTTP ${r.status}`) });
    } catch (e) {
      out.push({ devolucao: p.numero, trs: p.trs_numero, resultado: "falha", erro: msg(e) });
    }
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }
  return out;
}

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
    const itens: any[] = [];
    if (fila?.length) {
    const { data: cfg, error: ce } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (ce) throw ce;
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
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
    }
    const trs = await tratarTrsRetorno(db);
    console.log("devolucao-nf-verifica", JSON.stringify({ itens, trs }));
    return json({ ok: true, tratadas: itens.length, itens, trs });
  } catch (e) {
    console.error("devolucao-nf-verifica:", msg(e));
    return json({ ok: false, erro: msg(e) }, 500);
  }
});
