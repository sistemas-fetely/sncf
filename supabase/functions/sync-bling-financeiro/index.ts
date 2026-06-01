// Edge Function: sync-bling-financeiro
// Router modular: OAuth + sync por entidade (contatos, produtos, contas_receber, pedidos, nfe).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BLING_BASE, ensureFreshToken, makeBlingClient, type BlingConfig } from "../_shared/bling/bling-client.ts";
import { syncContatos } from "./sync-contatos.ts";
import { syncProdutos } from "./sync-produtos.ts";
import { syncEstoques } from "./sync-estoques.ts";
import { syncContasReceber } from "./sync-contas-receber.ts";
import { syncPedidos } from "./sync-pedidos.ts";
import { syncNfe } from "./sync-nfe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ok = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ sucesso: false, erro: msg }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Budget bem abaixo do idle timeout de 150s do edge runtime, para garantir
// que a função sempre retorne resposta antes do timeout (cliente faz loop).
const MAX_EXEC_MS = 90_000;

type Entidade = "contatos" | "produtos" | "estoques" | "contas_receber" | "pedidos" | "nfe";
// estoques roda depois de produtos (precisa dos bling_id já populados).
const ORDEM: Entidade[] = ["contatos", "produtos", "estoques", "contas_receber", "pedidos", "nfe"];

async function getOrCreateCursor(supabase: any, entidade: Entidade) {
  const { data } = await supabase.from("integracoes_sync_cursor")
    .select("*").eq("sistema", "bling").eq("entidade", entidade).maybeSingle();
  if (data) return data;
  const { data: created } = await supabase.from("integracoes_sync_cursor")
    .insert({ sistema: "bling", entidade, ultima_pagina: 0 })
    .select("*").maybeSingle();
  return created;
}

async function runEntity(
  supabase: any, client: any, entidade: Entidade, ultimaSync: string | null, timeUp: () => boolean,
) {
  const cursor = await getOrCreateCursor(supabase, entidade);
  await supabase.from("integracoes_sync_cursor").update({
    em_execucao: true, iniciado_em: new Date().toISOString(),
  }).eq("sistema", "bling").eq("entidade", entidade);

  let result: any;
  try {
    if (entidade === "contatos") result = await syncContatos(supabase, client, timeUp, cursor);
    else if (entidade === "produtos") result = await syncProdutos(supabase, client, timeUp, cursor);
    else if (entidade === "estoques") result = await syncEstoques(supabase, client, timeUp, cursor);
    else if (entidade === "contas_receber") result = await syncContasReceber(supabase, client, timeUp, cursor, ultimaSync);
    else if (entidade === "pedidos") result = await syncPedidos(supabase, client, timeUp, cursor, ultimaSync);
    else if (entidade === "nfe") result = await syncNfe(supabase, client, timeUp, cursor, ultimaSync);
  } finally {
    const finalizada = result?.proximaPagina === 0;
    await supabase.from("integracoes_sync_cursor").update({
      em_execucao: false,
      ultima_pagina: finalizada ? 0 : (result?.proximaPagina ?? cursor.ultima_pagina),
      ultima_data_corte: finalizada ? new Date().toISOString() : cursor.ultima_data_corte,
      updated_at: new Date().toISOString(),
    }).eq("sistema", "bling").eq("entidade", entidade);
  }
  return { entidade, ...result, finalizada: result?.proximaPagina === 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth + super_admin
    const auth = req.headers.get("Authorization");
    if (!auth) return err("Não autorizado", 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData.user) return err("Não autorizado", 401);
    const user = userData.user;
    const { data: roleData } = await supabase.from("user_roles")
      .select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
    if (!roleData) return err("Apenas super_admin", 403);

    const body = await req.json().catch(() => ({ tipo: "ping" }));
    const tipo = body.tipo || "ping";

    if (tipo === "ping") return ok({ sucesso: true, mensagem: "Edge OK" });

    // OAuth: troca code por tokens
    if (tipo === "token_exchange" || tipo === "oauth.exchange") {
      if (!body.code) return err("code obrigatório");
      const { data: cfg } = await supabase.from("integracoes_config")
        .select("client_id, client_secret").eq("sistema", "bling").maybeSingle();
      if (!cfg?.client_id || !cfg?.client_secret) return err("Client ID/Secret não cadastrados");

      const encoded = btoa(`${cfg.client_id}:${cfg.client_secret}`);
      const params = new URLSearchParams();
      params.set("grant_type", "authorization_code");
      params.set("code", body.code);
      params.set("redirect_uri", body.redirect_uri || "https://sncf.lovable.app/administrativo/bling-callback");
      const tokenRes = await fetch(`${BLING_BASE}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          Authorization: `Basic ${encoded}`,
        },
        body: params,
      });
      if (!tokenRes.ok) return err(`Bling rejeitou: ${tokenRes.status} ${await tokenRes.text()}`);
      const tokens = await tokenRes.json();
      await supabase.from("integracoes_config").update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        ativo: true,
        updated_at: new Date().toISOString(),
      }).eq("sistema", "bling");
      return ok({ sucesso: true, mensagem: "Bling conectado" });
    }

    // Desconectar (limpa tokens, preserva client_id/secret)
    if (tipo === "desconectar") {
      await supabase.from("integracoes_config").update({
        access_token: null, refresh_token: null, token_expires_at: null,
        ativo: false, updated_at: new Date().toISOString(),
      }).eq("sistema", "bling");
      return ok({ sucesso: true });
    }

    // Resetar cursor de uma entidade (força sync full)
    if (tipo === "resetar_cursor") {
      const ent = body.entidade as Entidade;
      if (!ORDEM.includes(ent)) return err("entidade inválida");
      await supabase.from("integracoes_sync_cursor").update({
        ultima_pagina: 0, ultima_data_corte: null, total_processado: 0, em_execucao: false,
      }).eq("sistema", "bling").eq("entidade", ent);
      return ok({ sucesso: true });
    }

    // Limpa logs travados
    if (tipo === "limpar_travados") {
      const limite = new Date(Date.now() - 3 * 60_000).toISOString();
      const { data: upd } = await supabase.from("integracoes_sync_log")
        .update({ status: "cancelado", detalhes: "Timeout automático" })
        .eq("status", "executando").lt("created_at", limite).select("id");
      await supabase.from("integracoes_sync_cursor").update({ em_execucao: false })
        .eq("sistema", "bling").lt("iniciado_em", limite);
      return ok({ sucesso: true, cancelados: upd?.length ?? 0 });
    }

    // === SYNC ===
    if (tipo === "sync" || tipo === "contas_receber" || tipo === "pedidos" || tipo === "produtos" || tipo === "estoques") {
      const entidades: Entidade[] =
        tipo === "sync"
          ? (Array.isArray(body.entidades) && body.entidades.length > 0 ? body.entidades : ORDEM)
          : tipo === "contas_receber" ? ["contas_receber"]
          : tipo === "pedidos" ? ["pedidos"]
          : tipo === "estoques" ? ["estoques"]
          : ["produtos"];

      for (const e of entidades) {
        if (!ORDEM.includes(e)) return err(`entidade inválida: ${e}`);
      }

      const { data: cfgData } = await supabase.from("integracoes_config")
        .select("*").eq("sistema", "bling").maybeSingle();
      if (!cfgData?.access_token) return err("Bling não conectado. Conecte primeiro.");

      const cfg: BlingConfig = cfgData as any;
      const accessToken = await ensureFreshToken(supabase, cfg);
      const client = makeBlingClient(supabase, cfg, accessToken);

      const startTs = Date.now();
      const timeUp = () => Date.now() - startTs > MAX_EXEC_MS;

      const { data: logRow } = await supabase.from("integracoes_sync_log").insert({
        sistema: "bling", tipo: entidades.join(","), status: "executando", iniciado_por: user.id,
      }).select("id").maybeSingle();
      const logId = logRow?.id ?? null;

      const resultados: any[] = [];
      try {
        for (const entidade of entidades) {
          if (timeUp()) break;
          const r = await runEntity(supabase, client, entidade, cfg.ultima_sync_at, timeUp);
          resultados.push(r);
        }
      } catch (e) {
        if (logId) await supabase.from("integracoes_sync_log").update({
          status: "erro", detalhes: `Falha: ${(e as Error).message}`,
          duracao_ms: Date.now() - startTs,
        }).eq("id", logId);
        throw e;
      }

      const totais = resultados.reduce((acc, r) => ({
        criados: acc.criados + (r.criados || 0),
        atualizados: acc.atualizados + (r.atualizados || 0),
        erros: acc.erros + (r.erros || 0),
      }), { criados: 0, atualizados: 0, erros: 0 });

      const algumNaoFinalizou = resultados.some((r) => !r.finalizada);
      const statusFinal = totais.erros > 0 ? "parcial" : algumNaoFinalizou ? "parcial" : "sucesso";
      const detalhe = resultados.map((r) =>
        `${r.entidade}: ${r.criados}n/${r.atualizados}a/${r.erros}e${r.finalizada ? "" : "↪"}`
      ).join(" | ");

      if (logId) await supabase.from("integracoes_sync_log").update({
        status: statusFinal,
        registros_criados: totais.criados,
        registros_atualizados: totais.atualizados,
        registros_erro: totais.erros,
        detalhes: detalhe,
        duracao_ms: Date.now() - startTs,
      }).eq("id", logId);

      await supabase.from("integracoes_config").update({
        ultima_sync_at: new Date().toISOString(),
        ultima_sync_status: statusFinal,
        ultima_sync_detalhes: detalhe,
        updated_at: new Date().toISOString(),
      }).eq("sistema", "bling");

      return ok({
        sucesso: true,
        ...totais,
        detalhes: detalhe,
        duracao_ms: Date.now() - startTs,
        continuar: algumNaoFinalizou,
        resultados,
      });
    }

    return err(`Tipo não reconhecido: ${tipo}`);
  } catch (e) {
    return err((e as Error).message || String(e), 500);
  }
});
