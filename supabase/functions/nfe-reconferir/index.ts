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

function ehNaoEncontrado(e: unknown): boolean {
  if (e instanceof BlingHttpError && e.status === 404) return true;
  if ((e as any)?.status === 404) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("Bling 404") || msg.includes("RESOURCE_NOT_FOUND");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const inicio = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = req.method === "POST" ? await req.json() : {}; } catch { body = {}; }
  const blingIds: string[] = Array.isArray(body?.bling_ids) ? body.bling_ids.map((x: unknown) => String(x ?? "").trim()).filter(Boolean) : [];
  const pedidoBlingId: string | null = body?.pedido_bling_id ? String(body.pedido_bling_id).trim() : null;
  const dirigido = blingIds.length > 0 || !!pedidoBlingId;
  if (blingIds.length > 10) return json({ ok: false, erro: "Máximo de 10 bling_ids por chamada." }, 400);
  if (blingIds.some((x) => !/^\d{1,20}$/.test(x)) || (pedidoBlingId && !/^\d{1,20}$/.test(pedidoBlingId))) return json({ ok: false, erro: "ID do Bling inválido." }, 400);

  // ---- Auth: cron secret OU super_admin; no modo dirigido também operador com permissão (FAIL-CLOSED)
  let userId: string | null = null;
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: esperado, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !esperado || cronSecret !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, erro: "Não autorizado." }, 401);
    const { data: u, error } = await sb.auth.getUser(token);
    if (error || !u?.user) return json({ ok: false, erro: "Sessão inválida." }, 401);
    userId = u.user.id;
    const { data: r } = await sb.from("user_roles").select("role").eq("user_id", userId).eq("role", "super_admin").maybeSingle();
    if (!r) {
      if (!dirigido) return json({ ok: false, erro: "Apenas super_admin." }, 403);
      const us = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const [a, b, c] = await Promise.all([
        us.rpc("tem_permissao", { p_slug: "tela.regularizacao_estoque" } as any),
        us.rpc("usuario_tem_acao", { p_slug: "acao.estoque_contagem_registrar" } as any),
        us.rpc("usuario_tem_acao", { p_slug: "acao.expedicao_sp_operar" } as any),
      ]);
      const errs = [a.error, b.error, c.error].filter(Boolean);
      if (errs.length && !(a.data || b.data || c.data)) return json({ ok: false, erro: `Falha ao checar permissão: ${errs[0]!.message}` }, 500);
      if (!(a.data === true || b.data === true || c.data === true)) return json({ ok: false, erro: "Sem permissão para verificar NFs no Bling." }, 403);
    }
  }

  if (dirigido) return await modoDirigido(sb, blingIds, pedidoBlingId);

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
          if (ehNaoEncontrado(e)) notFound = true;
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


async function clienteBling(sb: any) {
  const { data: cfgData, error: eCfg } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (eCfg) throw new Error(`config bling: ${eCfg.message}`);
  if (!cfgData?.access_token) throw new Error("Bling não conectado.");
  const cfg = cfgData as BlingConfig;
  return makeBlingClient(sb, cfg, await ensureFreshToken(sb, cfg));
}

async function modoDirigido(sb: any, blingIdsIn: string[], pedidoBlingId: string | null) {
  const mudancas: Array<{ bling_id: string; numero: string | null; de: string | null; para: string | null }> = [];
  const errosLista: Array<{ bling_id: string; numero: string | null; erro: string }> = [];
  try {
    const client = await clienteBling(sb);
    let ids = [...blingIdsIn];
    if (pedidoBlingId) {
      // 1) detalhe do pedido de venda traz notaFiscal.id quando já existe NF
      try {
        const ped = await client.get(`/pedidos/vendas/${encodeURIComponent(pedidoBlingId)}`);
        const nfId = ped?.data?.notaFiscal?.id;
        if (nfId && String(nfId) !== "0") ids.push(String(nfId));
      } catch (e) { if (!ehNaoEncontrado(e)) throw e; }
      // 2) NFs já conhecidas no SNCF ligadas a esse pedido
      const { data: conhecidas, error: eConhecidas } = await sb.from("nfs_emitidas").select("bling_id").eq("bling_pedido_venda_id", pedidoBlingId);
      if (eConhecidas) throw new Error(`NFs do pedido: ${eConhecidas.message}`);
      for (const c of (conhecidas ?? []) as any[]) if (c.bling_id) ids.push(String(c.bling_id));
      // 3) fallback: saídas dos últimos 3 dias cujo detalhe aponta para o pedido
      if (ids.length === 0) {
        const ini = new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);
        const lista = await client.get(`/nfe?tipo=1&dataEmissaoInicial=${ini}&limite=100`);
        for (const n of ((lista?.data ?? []) as any[]).slice(0, 30)) {
          if (ids.length >= 10) break;
          try {
            const det = await client.get(`/nfe/${n.id}`);
            if (String(det?.data?.pedidoVenda?.id ?? "") === pedidoBlingId) ids.push(String(n.id));
          } catch { /* ignora */ }
          await sleep(PAUSA_MS);
        }
      }
      ids = [...new Set(ids)].slice(0, 10);
    }

    for (const id of ids) {
      const { data: antes } = await sb.from("nfs_emitidas").select("id, numero, situacao").eq("bling_id", id).maybeSingle();
      let numero: string | null = antes?.numero ?? null;
      try {
        let d: any = null; let notFound = false;
        try { const det = await client.get(`/nfe/${encodeURIComponent(id)}`); d = det?.data ?? null; if (!d) notFound = true; }
        catch (e) { if (ehNaoEncontrado(e)) notFound = true; else throw e; }
        if (notFound) {
          if (antes && antes.situacao === "pendente") {
            const { data: atual } = await sb.from("nfs_emitidas").select("observacoes").eq("id", antes.id).maybeSingle();
            const nota = `Excluída no Bling (reconferência ${hojeBR()})`;
            const obs = atual?.observacoes ? `${atual.observacoes}\n${nota}` : nota;
            const { error } = await sb.from("nfs_emitidas").update({ situacao: "cancelada", observacoes: obs }).eq("id", antes.id);
            if (error) throw new Error(`marcar excluída: ${error.message}`);
            mudancas.push({ bling_id: id, numero, de: "pendente", para: "excluida" });
          } else {
            mudancas.push({ bling_id: id, numero, de: antes?.situacao ?? null, para: "excluida" });
          }
        } else {
          numero = numero ?? (d.numero != null ? String(d.numero) : null);
          const st = novoEstadoNfe();
          await processarNfItem(sb, client, d, st, { forcarDetalhe: true });
          if (st.erros > 0) throw new Error(st.ultimoErro || "falha ao gravar NF");
          const { data: depois } = await sb.from("nfs_emitidas").select("numero, situacao").eq("bling_id", id).maybeSingle();
          numero = depois?.numero ?? numero;
          mudancas.push({ bling_id: id, numero, de: antes?.situacao ?? null, para: depois?.situacao ?? situacaoRealDetalhe(d) ?? null });
        }
      } catch (e) {
        errosLista.push({ bling_id: id, numero, erro: e instanceof Error ? e.message : String(e) });
      }
      await sb.from("nfs_emitidas").update({ reconferida_em: new Date().toISOString() }).eq("bling_id", id);
      await sleep(PAUSA_MS);
    }
    return json({ ok: true, modo: "dirigido", verificadas: ids.length, resultados: mudancas, mudancas, erros: errosLista.length, erros_lista: errosLista });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
}
