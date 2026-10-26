// Manutencao: reconfere no Bling o status de NFs onde o cancelamento fica invisivel
// (listagem /nfe devolve cancelada como autorizada; pendentes nunca sao reabertas).
// Fila em rodizio: fn_nfe_reconferir_fila. Mudanca de situacao vai pela porta unica
// processarNfItem (forcarDetalhe); triggers existentes propagam o cancelamento.
// Acesso: x-cron-secret (vault SYNC_CRON_SECRET) ou usuario super_admin.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BlingHttpError, ensureFreshToken, makeBlingClient, type BlingConfig } from "../_shared/bling/bling-client.ts";
import { novoEstadoNfe, processarNfItem, situacaoRealDetalhe } from "../_shared/bling/nfe-item.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-cron-secret` };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const PAUSA_MS = 350;
const BUDGET_MS = 50_000;

function hojeBR(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const inicio = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- Auth: cron secret OU super_admin (FAIL-CLOSED)
  let userId: string | null = null;
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: esperado, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !esperado || cronSecret !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, erro: "Não autorizado." }, 401);
    const { data: u, error } = await sb.auth.getUser(token);
    if (error || !u?.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
    const { data: r } = await sb.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "super_admin").maybeSingle();
    if (!r) return json({ ok: false, erro: "Apenas super_admin." }, 403);
    userId = u.user.id;
  }

  const { data: logRow } = await sb.from("integracoes_sync_log").insert({
    sistema: "bling", tipo: "nfe_reconferir", status: "executando", iniciado_por: userId,
  }).select("id").maybeSingle();
  const logId = logRow?.id ?? null;

  let reconferidas = 0, excluidas = 0, erros = 0;
  const canceladasNums: string[] = [];
  const mudancas: Array<{ numero: string | null; de: string | null; para: string | null }> = [];
  const errosLista: Array<{ numero: string | null; erro: string }> = [];

  try {
    const { data: fila, error: eFila } = await sb.rpc("fn_nfe_reconferir_fila");
    if (eFila) throw new Error(`fila: ${eFila.message}`);

    const { data: cfgData, error: eCfg } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (eCfg) throw new Error(`config bling: ${eCfg.message}`);
    if (!cfgData?.access_token) throw new Error("Bling não conectado.");
    const cfg = cfgData as BlingConfig;
    const client = makeBlingClient(sb, cfg, await ensureFreshToken(sb, cfg));

    for (const nf of (fila ?? []) as any[]) {
      if (Date.now() - inicio > BUDGET_MS) break;
      const numero = nf.numero ?? null;
      try {
        let d: any = null;
        let notFound = false;
        try {
          const det = await client.get(`/nfe/${encodeURIComponent(String(nf.bling_id))}`);
          d = det?.data ?? null;
          if (!d) notFound = true;
        } catch (e) {
          if (e instanceof BlingHttpError && e.status === 404) notFound = true;
          else throw e;
        }

        if (notFound) {
          if (nf.situacao === "pendente") {
            const { data: atual } = await sb.from("nfs_emitidas").select("observacoes").eq("id", nf.id).maybeSingle();
            const nota = `Excluída no Bling (reconferência ${hojeBR()})`;
            const obs = atual?.observacoes ? `${atual.observacoes}\n${nota}` : nota;
            const { error } = await sb.from("nfs_emitidas").update({ situacao: "cancelada", observacoes: obs }).eq("id", nf.id);
            if (error) throw new Error(`marcar excluída: ${error.message}`);
            excluidas++;
            mudancas.push({ numero, de: nf.situacao, para: "cancelada" });
          } else {
            console.warn(`NF ${numero} (${nf.bling_id}) ${nf.situacao} devolveu 404 no Bling — só log.`);
          }
        } else {
          const real = situacaoRealDetalhe(d);
          if (real && real !== nf.situacao) {
            const st = novoEstadoNfe();
            await processarNfItem(sb, client, d, st, { forcarDetalhe: true });
            if (st.erros > 0) throw new Error(st.ultimoErro || "falha ao gravar NF");
            const { data: depois } = await sb.from("nfs_emitidas").select("situacao").eq("id", nf.id).maybeSingle();
            const para = depois?.situacao ?? real;
            if (para !== nf.situacao) {
              mudancas.push({ numero, de: nf.situacao, para });
              if (para === "cancelada") canceladasNums.push(String(numero ?? nf.bling_id));
            }
          }
        }
        reconferidas++;
      } catch (e) {
        erros++;
        errosLista.push({ numero, erro: e instanceof Error ? e.message : String(e) });
      }
      // sempre carimba (mesmo sem mudança ou com erro, para o rodízio andar)
      await sb.from("nfs_emitidas").update({ reconferida_em: new Date().toISOString() }).eq("id", nf.id);
      await sleep(PAUSA_MS);
    }

    const detalhes = `reconferidas ${reconferidas} · canceladas detectadas ${canceladasNums.length}` +
      `${canceladasNums.length ? ` (${canceladasNums.join(", ")})` : ""} · excluídas ${excluidas} · erros ${erros}`;
    if (logId) await sb.from("integracoes_sync_log").update({
      status: erros > 0 ? "parcial" : "sucesso", detalhes, duracao_ms: Date.now() - inicio,
    }).eq("id", logId);

    return json({
      ok: true, reconferidas, canceladas_detectadas: canceladasNums.length, canceladas_numeros: canceladasNums,
      excluidas, erros, erros_lista: errosLista, mudancas, detalhes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) await sb.from("integracoes_sync_log").update({
      status: "erro", detalhes: `Falha: ${msg}`, duracao_ms: Date.now() - inicio,
    }).eq("id", logId);
    return json({ ok: false, erro: msg }, 500);
  }
});
