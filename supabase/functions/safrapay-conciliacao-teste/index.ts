// Diagnóstico somente leitura no Safrapay. Única escrita: tabela privada de tentativas.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { baseSegura, entrada, lerCorpo, msgApi, qtdeItens, semSegredos, tentativas } from "./helpers.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-cron-secret` };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, erro: "Configuração interna indisponível." }, 500);
  const sb = createClient(url, service);
  const segredos: string[] = [service];
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret) {
      const { data: esperado, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (error || !esperado) return json({ ok: false, erro: "Não foi possível validar o x-cron-secret." }, 401);
      if (cronSecret !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
      segredos.push(cronSecret);
    } else {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
      const { data: u, error: eU } = await sb.auth.getUser(auth.slice(7).trim());
      if (eU || !u?.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
      segredos.push(auth.slice(7).trim());
      const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
      let permitido = false;
      for (const slug of ["tela.venda_direta_gestao", "acao.cobranca_gerar_link"]) {
        const { data: ok, error: eP } = await sbUser.rpc("tem_permissao", { p_slug: slug });
        if (eP) return json({ ok: false, erro: `Falha ao avaliar permissão: ${eP.message}` }, 500);
        if (ok === true) { permitido = true; break; }
      }
      if (!permitido) return json({ ok: false, erro: "Sem permissão (tela.venda_direta_gestao ou acao.cobranca_gerar_link)." }, 403);
    }
    let params;
    try {
      const texto = await req.text();
      params = entrada(texto.trim() ? JSON.parse(texto) : {});
    } catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : "Body inválido." }, 400); }

    const { data: cfg, error: eCfg } = await sb.from("safrapay_config").select("*").eq("id", 1).maybeSingle();
    if (eCfg || !cfg) throw new Error(`Ler configuração Safrapay: ${eCfg?.message ?? "ausente"}`);
    const tokens = new Map<string, string>();
    async function token(amb: string): Promise<{ api: string; bearer: string }> {
      const api = baseSegura(String(cfg[`url_api_${amb}`] ?? ""));
      const segredo = cfg[`segredo_token_${amb}`];
      if (!api || !segredo) throw new Error(`Configuração Safrapay incompleta para ${amb}.`);
      const cached = tokens.get(amb);
      if (cached) return { api, bearer: cached };
      const { data: mt, error } = await sb.rpc("get_vault_secret", { p_name: segredo });
      if (error || !mt) throw new Error(`MerchantToken indisponível (${segredo}).`);
      segredos.push(String(mt));
      const r = await fetch(`${api}/v2/merchant/auth`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: String(mt), "Content-Type": "application/json" } });
      const c = await lerCorpo(r);
      const at = c?.accessToken ?? c?.data?.accessToken;
      if (!r.ok || !at) throw new Error(`Autenticação: ${msgApi(semSegredos(c, segredos), r.status)}`);
      tokens.set(amb, String(at));
      segredos.push(String(at));
      return { api, bearer: String(at) };
    }
    const amb = cfg.ambiente === "prod" ? "prod" : "hml";
    const mid = String(cfg[`merchant_id_${amb}`] ?? "").trim();
    if (!mid) throw new Error(`merchant_id_${amb} ausente.`);
    const { api, bearer } = await token(amb);
    const resumo = [];
    for (const t of tentativas(api, mid, params.start, params.end, params.bases)) {
      let http_status: number | null = null;
      let corpo: any = null;
      let erro: string | null = null;
      try {
        const r = await fetch(t.url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${bearer}`, MerchantId: mid, "Content-Type": "application/json" } });
        http_status = r.status;
        corpo = semSegredos(await lerCorpo(r), segredos);
        if (!r.ok) erro = msgApi(corpo, r.status);
      } catch (e) { erro = semSegredos(e instanceof Error ? e.message : String(e), segredos); }
      const qtde_itens = qtdeItens(corpo);
      const linha = { ...t, http_status, qtde_itens, erro };
      const { error: eGravar } = await sb.from("safrapay_api_conciliacao_teste").insert({ ...linha, corpo });
      if (eGravar) throw new Error(`Gravar tentativa ${t.tentativa}: ${eGravar.message}`);
      resumo.push(linha);
    }
    return json({ ok: true, tentativas: resumo });
  } catch (e) {
    return json({ ok: false, erro: semSegredos(e instanceof Error ? e.message : String(e), segredos) }, 500);
  }
});