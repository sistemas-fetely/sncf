// CORRIGIR-NF-V2: NF substituta de SAÍDA direto no Bling, somente rascunho; nunca reenviar pedido ou transmitir à SEFAZ.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { gerarSubstituta, type DadosSubstituta } from "./gerar.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
const schema = z.object({ devolucao_id: z.string().uuid() }).strict();
async function comPrazo<T>(acao: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([acao, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Tempo limite na comunicação com o Bling (criação incerta).")), 25_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, erro: "Configuração interna incompleta" }, 500);
  const db = createClient(url, service);
  const cron = req.headers.get("x-cron-secret");
  if (cron !== null) {
    const { data, error } = await db.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !data || cron !== data) return json({ ok: false, erro: "x-cron-secret inválido ou indisponível." }, 401);
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Sessão obrigatória." }, 401);
    const usuario = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data, error } = await usuario.auth.getClaims(auth.slice(7));
    const userId = data?.claims?.sub;
    if (error || !userId) return json({ ok: false, erro: "Sessão inválida." }, 401);
    const { data: permitido, error: permError } = await usuario.rpc("tem_permissao", { p_slug: "tela.devolucoes", p_user: userId });
    if (permError) return json({ ok: false, erro: permError.message }, 500);
    if (permitido !== true) return json({ ok: false, erro: "Sem permissão para devoluções." }, 403);
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, erro: "Corpo inválido: informe devolucao_id UUID." }, 400);
  const devId = parsed.data.devolucao_id;
  const registrar = async (status: string, id: number | null = null, numero: string | null = null, erro: string | null = null) => {
    const { data, error } = await db.rpc("fn_refaturar_nf_sub_registrar", { p_devolucao_id: devId, p_status: status, p_bling_id: id, p_numero: numero, p_erro: erro });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.erro ?? "Registro da NF substituta recusado.");
    return data;
  };
  try { await registrar("gerando"); } catch (e) { return json({ ok: false, erro: mensagem(e) }, 409); }
  let d: DadosSubstituta; let bling;
  try {
    const { data, error } = await db.rpc("fn_refaturar_dados_nf_substituta", { p_devolucao_id: devId });
    if (error) throw error;
    d = data as DadosSubstituta;
    const { data: cfg, error: cfgError } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (cfgError) throw cfgError;
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
  } catch (e) {
    let erro = mensagem(e);
    try { await registrar("erro", null, null, erro); } catch (re) { erro += ` · Falha ao registrar o erro: ${mensagem(re)}`; }
    return json({ ok: false, erro }, 502);
  }
  try {
    const resultado = await gerarSubstituta(d, {
      bling: { get: (path) => comPrazo(bling.get(path)), post: (path, body, opts) => comPrazo(bling.post(path, body, opts)) }, registrar,
      idsUsados: async () => {
        const ids = new Set<number>();
        for (let inicio = 0; ; inicio += 1000) {
          const { data, error } = await db.from("devolucao").select("id,nf_sub_bling_id").not("nf_sub_bling_id", "is", null).order("id").range(inicio, inicio + 999);
          if (error) throw error;
          for (const row of data ?? []) ids.add(Number(row.nf_sub_bling_id));
          if ((data?.length ?? 0) < 1000) break;
        }
        return ids;
      },
    });
    return json(resultado, 201);
  } catch (e) { return json({ ok: false, erro: mensagem(e) }, 502); }
});