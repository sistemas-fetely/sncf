/**
 * shopify-pagamento-sync — mapa token Mercado Pago → pedido Shopify (shopify_pagamento_ref).
 * MP FASE 2 (03/11/2026): guarda TODOS os pagamentos SUCCESS SALE/CAPTURE de gateway Mercado Pago
 * de cada pedido (N tokens por pedido), idempotente por token; recusadas nunca entram.
 * Paginação por cursor numa janela de data: diário = desde a última execução diária concluída − 2 dias;
 * backfill (modo=backfill&desde=AAAA-MM-DD) retoma do cursor salvo em shopify_pagamento_sync_execucao.
 * Falha da execução diária fica em status=erro → card TI (vw_shopify_pagamento_sync_falha).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API_VERSION = "2026-04";
const CANDIDATE_DOMAINS = ["mmiavm-ui.myshopify.com", "fetely-3.myshopify.com"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getSecret(supabase: any, name: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_vault_secret", { p_name: name });
  if (error || !data) return null;
  return String(data);
}

async function log(supabase: any, etapa: string, detalhe: unknown) {
  try {
    await supabase.from("shopify_webhook_log").insert({ topic: "pagamento_sync", etapa, detalhe });
  } catch (_) {}
}

async function exchangeToken(domain: string, clientId: string, clientSecret: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

async function gql(domain: string, token: string, query: string, variables: unknown) {
  const res = await fetch(`https://${domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { body = { parseError: text.slice(0, 500) }; }
  return { status: res.status, body };
}

function txList(node: any): any[] {
  const t = node?.transactions;
  if (!t) return [];
  if (Array.isArray(t)) return t;
  if (Array.isArray(t?.edges)) return t.edges.map((e: any) => e.node);
  return [];
}

const QUERY = `
query janela($q: String!, $after: String) {
  orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    edges { node { id name transactions { id gateway kind status paymentId authorizationCode accountNumber } } }
  }
}`;

const ORCAMENTO_MS = 100_000;

/** Pagamentos aprovados do Mercado Pago (SALE/CAPTURE, SUCCESS) → tokens únicos. */
export function tokensAprovadosMp(txs: any[]): { token: string; kind: string; gateway: string }[] {
  const out: { token: string; kind: string; gateway: string }[] = [];
  const vistos = new Set<string>();
  for (const tx of txs) {
    const gw = String(tx?.gateway ?? "");
    if (!/mercado/i.test(gw)) continue;
    if (String(tx?.status ?? "").toUpperCase() !== "SUCCESS") continue;
    const kind = String(tx?.kind ?? "").toUpperCase();
    if (kind !== "SALE" && kind !== "CAPTURE") continue;
    const cand = tx?.paymentId ?? tx?.authorizationCode ?? null;
    const tok = cand ? String(cand).trim() : "";
    if (!tok || vistos.has(tok)) continue;
    vistos.add(tok);
    out.push({ token: tok, kind, gateway: gw });
  }
  return out;
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Porta de máquina (x-cron-secret) ou usuário com acao.mp_relatorio.reprocessar (backfill manual).
  const provided = req.headers.get("x-cron-secret");
  if (provided) {
    const expected = await getSecret(supabase, "SYNC_CRON_SECRET");
    if (!expected || provided !== expected) return json(401, { error: "unauthorized" });
  } else {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "unauthorized" });
    const sbUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: ok, error } = await sbUser.rpc("usuario_tem_acao", { p_slug: "acao.mp_relatorio.reprocessar" });
    if (error || ok !== true) return json(403, { error: "Sem permissão (acao.mp_relatorio.reprocessar)." });
  }

  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* sem body */ }
  const par = (k: string) => url.searchParams.get(k) ?? (body?.[k] != null ? String(body[k]) : null);
  const probe = par("probe") === "1";
  const modo: "diario" | "backfill" = par("modo") === "backfill" ? "backfill" : "diario";

  const clientId = await getSecret(supabase, "SHOPIFY_CLIENT_ID");
  const clientSecret = await getSecret(supabase, "SHOPIFY_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    await log(supabase, "erro", { motivo: "creds_ausentes" });
    if (modo === "diario") await supabase.from("shopify_pagamento_sync_execucao").insert({ modo, desde: new Date().toISOString(), ate: new Date().toISOString(), status: "erro", erro: "Credenciais Shopify ausentes no vault" });
    return json(500, { error: "shopify creds ausentes no vault" });
  }
  const storedDomain = await getSecret(supabase, "SHOPIFY_STORE_DOMAIN");
  const domainsToTry = storedDomain ? [storedDomain] : CANDIDATE_DOMAINS;
  let domain: string | null = null;
  let token: string | null = null;
  for (const d of domainsToTry) {
    const t = await exchangeToken(d, clientId, clientSecret);
    if (t) { domain = d; token = t; break; }
  }
  if (!domain || !token) {
    await log(supabase, "erro", { motivo: "sem_dominio", tried: domainsToTry });
    if (modo === "diario") await supabase.from("shopify_pagamento_sync_execucao").insert({ modo, desde: new Date().toISOString(), ate: new Date().toISOString(), status: "erro", erro: `Nenhum domínio Shopify autenticou (${domainsToTry.join(", ")})` });
    return json(502, { error: "nenhum dominio autenticou", tried: domainsToTry });
  }

  if (probe) {
    const r = await gql(domain, token, QUERY, { q: `created_at:>='${new Date(Date.now() - 3 * 86400_000).toISOString()}'`, after: null });
    const amostra = (r.body?.data?.orders?.edges ?? []).slice(0, 5).map((e: any) => ({ order_name: e.node.name, transactions: txList(e.node), aprovados: tokensAprovadosMp(txList(e.node)) }));
    return json(200, { ok: true, modo: "probe", domain, amostra });
  }

  // ---- execução: nova ou retomada (backfill)
  let exec: any = null;
  if (modo === "backfill") {
    const desde = par("desde") ?? "2026-06-01";
    const desdeIso = new Date(`${desde.slice(0, 10)}T00:00:00-03:00`).toISOString();
    const ateIso = par("ate") ? new Date(`${par("ate")!.slice(0, 10)}T23:59:59-03:00`).toISOString() : new Date().toISOString();
    let qa = supabase.from("shopify_pagamento_sync_execucao").select("*").eq("modo", "backfill").eq("status", "pausado").eq("desde", desdeIso);
    if (par("ate")) qa = qa.eq("ate", ateIso);
    const { data: aberta } = await qa.order("iniciado_em", { ascending: false }).limit(1).maybeSingle();
    exec = aberta ?? null;
    if (!exec) {
      const { data, error } = await supabase.from("shopify_pagamento_sync_execucao").insert({ modo, desde: desdeIso, ate: ateIso }).select("*").single();
      if (error) return json(500, { error: `controle: ${error.message}` });
      exec = data;
    } else {
      await supabase.from("shopify_pagamento_sync_execucao").update({ status: "rodando", atualizado_em: new Date().toISOString() }).eq("id", exec.id);
    }
  } else {
    const { data: ult } = await supabase.from("shopify_pagamento_sync_execucao").select("ate")
      .eq("modo", "diario").eq("status", "concluido").order("concluido_em", { ascending: false }).limit(1).maybeSingle();
    const base = ult?.ate ? new Date(ult.ate).getTime() : Date.now() - 86400_000;
    const { data, error } = await supabase.from("shopify_pagamento_sync_execucao")
      .insert({ modo, desde: new Date(base - 2 * 86400_000).toISOString(), ate: new Date().toISOString() }).select("*").single();
    if (error) return json(500, { error: `controle: ${error.message}` });
    exec = data;
  }

  // Diário: pedidos ATUALIZADOS na janela (pagamento aprovado depois da criação); backfill: criados.
  const campo = modo === "diario" ? "updated_at" : "created_at";
  const q = `${campo}:>='${exec.desde}' ${campo}:<='${exec.ate}'`;
  let cursor: string | null = exec.cursor ?? null;
  const cont = { paginas: exec.paginas ?? 0, pedidos_lidos: exec.pedidos_lidos ?? 0, refs_novas: exec.refs_novas ?? 0, refs_ja_existiam: exec.refs_ja_existiam ?? 0 };
  const conflitos: any[] = Array.isArray(exec.conflitos) ? exec.conflitos : [];
  const novas: { order_name: string; token: string }[] = [];
  let terminou = false;

  try {
    while (true) {
      if (Date.now() - t0 > ORCAMENTO_MS) break;
      const r = await gql(domain, token, QUERY, { q, after: cursor });
      if (r.status !== 200 || r.body?.errors) throw new Error(`GraphQL ${r.status}: ${JSON.stringify(r.body?.errors ?? r.body).slice(0, 400)}`);
      const ord = r.body?.data?.orders;
      const edges = ord?.edges ?? [];
      cont.paginas++;
      cont.pedidos_lidos += edges.length;

      const linhas: any[] = [];
      for (const e of edges) {
        const node = e.node;
        const m = String(node.id ?? "").match(/Order\/(\d+)/);
        for (const t of tokensAprovadosMp(txList(node))) {
          linhas.push({ order_name: node.name, shopify_id: m ? m[1] : null, token: t.token, fonte: "api_shopify" });
        }
      }
      if (linhas.length) {
        const { data: exist, error: eEx } = await supabase.from("shopify_pagamento_ref").select("token, order_name").in("token", linhas.map((l) => l.token));
        if (eEx) throw new Error(`leitura de tokens: ${eEx.message}`);
        const mapa = new Map((exist ?? []).map((x: any) => [x.token, x.order_name]));
        const inserir = [];
        for (const l of linhas) {
          const ja = mapa.get(l.token);
          if (ja === undefined) inserir.push(l);
          else if (ja === l.order_name) cont.refs_ja_existiam++;
          else conflitos.push({ token: l.token, pedido_shopify: l.order_name, ja_ligado_a: ja });
        }
        if (inserir.length) {
          const { error: eUp } = await supabase.from("shopify_pagamento_ref").upsert(inserir, { onConflict: "token", ignoreDuplicates: true });
          if (eUp) throw new Error(`gravação de tokens: ${eUp.message}`);
          cont.refs_novas += inserir.length;
          novas.push(...inserir.map((l) => ({ order_name: l.order_name, token: l.token })));
        }
      }
      cursor = ord?.pageInfo?.endCursor ?? cursor;
      if (!ord?.pageInfo?.hasNextPage) { terminou = true; break; }
    }
    const status = terminou ? "concluido" : (modo === "backfill" ? "pausado" : "erro");
    await supabase.from("shopify_pagamento_sync_execucao").update({
      ...cont, cursor, conflitos, status, atualizado_em: new Date().toISOString(),
      concluido_em: terminou ? new Date().toISOString() : null,
      erro: terminou || modo === "backfill" ? null : "Orçamento de tempo esgotado antes do fim da janela diária",
    }).eq("id", exec.id);
    await log(supabase, "run", { domain, modo, execucao: exec.id, status, ...cont, conflitos: conflitos.length });
    return json(200, { ok: true, modo, execucao_id: exec.id, status, janela: { desde: exec.desde, ate: exec.ate, campo }, ...cont, conflitos, novas_nesta_chamada: novas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("shopify_pagamento_sync_execucao").update({ ...cont, cursor, conflitos, status: "erro", erro: msg, atualizado_em: new Date().toISOString() }).eq("id", exec.id);
    await log(supabase, "erro", { modo, execucao: exec.id, erro: msg });
    return json(500, { ok: false, modo, execucao_id: exec.id, erro: msg, ...cont });
  }
});
