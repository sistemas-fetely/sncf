// Ponte FOP → SNCF: corrige o vendedor do pedido quando o representante foi trocado no FOP.
// Corpo opcional { simular: true } → só calcula. FAIL-LOUD: qualquer falha é 500 com a mensagem real.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";
const FOP_ANON_KEY = "sb_publishable_LKB5TwMha9KGj8v_YZkquA_Zz8NyriO";

function msg(e: unknown): string {
  if (!e) return "Erro desconhecido";
  if (typeof e === "string") return e;
  const o = e as Record<string, unknown>;
  return String(o.message ?? o.error_description ?? o.error ?? JSON.stringify(e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const cron = req.headers.get("x-cron-secret");
    if (cron) {
      const { data: esperado, error } = await supabase.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
      if (error) throw new Error(`Falha ao ler SYNC_CRON_SECRET: ${msg(error)}`);
      if (!esperado || cron !== String(esperado)) return json({ ok: false, erro: "x-cron-secret inválido" }, 401);
    } else {
      const auth = req.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autenticado" }, 401);
      const { data: u, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
      if (uErr || !u?.user) return json({ ok: false, erro: "Sessão inválida" }, 401);
    }

    let body: Record<string, unknown> = {};
    try { body = (await req.json()) ?? {}; } catch { body = {}; }
    const simular = body?.simular === true;

    const { data: token, error: tErr } = await supabase.rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });
    if (tErr) throw new Error(`Falha ao ler FOP_INBOUND_TOKEN: ${msg(tErr)}`);
    if (!token) throw new Error("FOP_INBOUND_TOKEN ausente no vault");

    const fop = createClient(FOP_URL, FOP_ANON_KEY, { auth: { persistSession: false } });
    const { data: linhasRaw, error: fErr } = await fop.rpc("fn_pedidos_vendedor_para_sncf", { p_token: String(token) });
    if (fErr) throw new Error(`FOP recusou fn_pedidos_vendedor_para_sncf: ${msg(fErr)}`);
    if (!Array.isArray(linhasRaw)) throw new Error("fn_pedidos_vendedor_para_sncf não devolveu um array");

    const { data: res, error: rErr } = await supabase.rpc("fn_pedido_vendedor_sincronizar", {
      p_linhas: linhasRaw, p_simular: simular,
    });
    if (rErr) throw new Error(`fn_pedido_vendedor_sincronizar falhou: ${msg(rErr)}`);
    if (res == null) throw new Error("fn_pedido_vendedor_sincronizar não devolveu resultado");

    console.log("[sync-pedido-vendedor]", JSON.stringify({ simular, lidos_fop: linhasRaw.length }));
    return json(res);
  } catch (e) {
    const m = msg(e);
    console.error("[sync-pedido-vendedor] ERRO:", m);
    return json({ ok: false, erro: m }, 500);
  }
});
