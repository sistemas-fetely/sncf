// Mercado Livre — OAuth 2.0 (authorization code + PKCE S256). F0 MELI-DIRETO.
// POST {acao:'iniciar', conta} (sessão + acao.credenciais_integracao.gravar) → {url}
// GET ?code&state (retorno do ML, sem JWT; validado pelo state de uso único) → 302 para TI › Integrações.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { MELI_API, segredo, trocarToken } from "../_shared/meli/token.ts";
import { aleatorio, desafioS256 } from "../_shared/meli/pkce.ts";

const REDIRECT_URI = "https://vaxzorhqzvsnkutrlvfr.supabase.co/functions/v1/meli-oauth";
const AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ acao: z.literal("iniciar"), conta: z.string().min(1).max(60) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (req.method === "POST") {
    const p = await exigirAcao(db, req.headers.get("Authorization"), "acao.credenciais_integracao.gravar", "conectar o Mercado Livre");
    if (!p.ok || !p.userId) return json({ ok: false, erro: p.erro ?? "Não autorizado" }, p.ok ? 401 : p.status);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ ok: false, erro: parsed.error.flatten().fieldErrors }, 400);
    const { data: c, error } = await db.from("meli_conta").select("codigo,segredo_client_id,segredo_client_secret,ativo").eq("codigo", parsed.data.conta).maybeSingle();
    if (error) return json({ ok: false, erro: `Falha ao ler a conta: ${error.message}` }, 500);
    if (!c?.ativo) return json({ ok: false, erro: "Conta Mercado Livre não cadastrada ou inativa" }, 400);
    let clientId: string;
    try { clientId = await segredo(db, c.segredo_client_id); await segredo(db, c.segredo_client_secret); }
    catch { return json({ ok: false, erro: "Grave o App ID e a Secret Key da aplicação antes de conectar." }, 400); }
    const state = aleatorio(24), verifier = aleatorio(48);
    const { error: ie } = await db.from("meli_oauth_state").insert({ state, conta_codigo: c.codigo, code_verifier: verifier, criado_por: p.userId });
    if (ie) return json({ ok: false, erro: `Falha ao iniciar: ${ie.message}` }, 500);
    const u = new URL(AUTH_URL);
    u.search = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT_URI, state, code_challenge: await desafioS256(verifier), code_challenge_method: "S256" }).toString();
    return json({ ok: true, url: u.toString() });
  }

  if (req.method !== "GET") return json({ ok: false, erro: "Método não suportado" }, 405);
  const { data: base } = await db.rpc("fn_url_publica");
  const destino = (extra: Record<string, string>) => {
    const u = new URL("/ti/integracoes", String(base || "https://sncf.lovable.app"));
    u.search = new URLSearchParams({ aba: "mercado-livre", ...extra }).toString();
    return new Response(null, { status: 302, headers: { Location: u.toString() } });
  };
  const q = new URL(req.url).searchParams;
  const code = q.get("code"), state = q.get("state");
  if (!state || state.length > 100) return destino({ meli: "erro", motivo: "Retorno sem state" });
  const { data: st } = await db.from("meli_oauth_state").select("*").eq("state", state).maybeSingle();
  if (!st) return destino({ meli: "erro", motivo: "Autorização desconhecida; comece de novo" });
  const conta = st.conta_codigo as string;
  const falha = async (motivo: string) => { await db.rpc("fn_meli_registrar_erro_token", { p_conta: conta, p_erro: motivo }); return destino({ meli: "erro", motivo: motivo.slice(0, 160) }); };
  if (st.usado_em) return falha("Autorização já usada; comece de novo");
  if (Date.parse(st.expira_em) < Date.now()) return falha("Autorização expirou (10 min); comece de novo");
  const { data: marcado } = await db.from("meli_oauth_state").update({ usado_em: new Date().toISOString() }).eq("state", state).is("usado_em", null).select("state");
  if (!marcado?.length) return falha("Autorização já usada; comece de novo");
  if (!code) return falha(q.get("error_description") || q.get("error") || "Mercado Livre não devolveu o código");

  try {
    const { data: c, error } = await db.from("meli_conta").select("segredo_client_id,segredo_client_secret").eq("codigo", conta).single();
    if (error) throw new Error(`Falha ao ler a conta: ${error.message}`);
    const [cid, cs] = await Promise.all([segredo(db, c.segredo_client_id), segredo(db, c.segredo_client_secret)]);
    const t = await trocarToken(fetch, { grant_type: "authorization_code", client_id: cid, client_secret: cs, code, redirect_uri: REDIRECT_URI, code_verifier: st.code_verifier });
    const r = await fetch(`${MELI_API}/users/me`, { headers: { Authorization: `Bearer ${t.access}`, Accept: "application/json" } });
    const me: any = await r.json().catch(() => ({}));
    if (!r.ok || !me?.id) throw new Error(`Mercado Livre não devolveu a conta (HTTP ${r.status})`);
    const { error: ge } = await db.rpc("fn_meli_gravar_tokens", {
      p_conta: conta, p_access: t.access, p_refresh: t.refresh, p_expira_em: new Date(Date.now() + t.expiraEmSeg * 1000).toISOString(),
      p_seller_id: Number(me.id), p_nickname: me.nickname ?? null, p_site_id: me.site_id ?? null, p_por: st.criado_por,
    });
    if (ge) throw new Error(`Falha ao gravar os tokens: ${ge.message}`);
    return destino({ meli: "ok" });
  } catch (e) {
    return falha(e instanceof Error ? e.message : String(e));
  }
});
