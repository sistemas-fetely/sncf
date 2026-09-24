// Ponte FOP → SNCF: espelha os representantes do FOP em vendedores.
// O FOP cadastra, o SNCF lê. FAIL-LOUD: qualquer falha é 500 com a mensagem real.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";
const CAMPOS =
  "id,nome_completo,email,telefone,regiao,cnpj_cpf,empresa,tipo_vendedor,comissao_percent,ativo,login_count,last_login_at";

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
    // Auth: x-cron-secret OU sessão válida
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

    const { data: chave, error: kErr } = await supabase.rpc("get_vault_secret", { p_name: "FOP_SERVICE_ROLE_KEY" });
    if (kErr) throw new Error(`Falha ao ler FOP_SERVICE_ROLE_KEY: ${msg(kErr)}`);
    if (!chave) throw new Error("FOP_SERVICE_ROLE_KEY ausente no vault");

    const fop = createClient(FOP_URL, String(chave), { auth: { persistSession: false } });
    const linhas: unknown[] = [];
    for (let off = 0; ; off += 1000) {
      const { data, error } = await fop
        .from("profiles")
        .select(CAMPOS)
        .eq("tipo_vendedor", "representante")
        .order("id")
        .range(off, off + 999);
      if (error) throw new Error(`FOP recusou a leitura de profiles: ${msg(error)}`);
      linhas.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }

    const { data: res, error: rErr } = await supabase.rpc("fn_vendedor_sincronizar_fop", { p_linhas: linhas });
    if (rErr) throw new Error(`fn_vendedor_sincronizar_fop falhou: ${msg(rErr)}`);
    if (res == null) throw new Error("fn_vendedor_sincronizar_fop não devolveu resultado");

    console.log("[sync-vendedores-fop]", JSON.stringify({ lidos_fop: linhas.length, resultado: res }));
    return json(res);
  } catch (e) {
    const m = msg(e);
    console.error("[sync-vendedores-fop] ERRO:", m);
    return json({ ok: false, erro: m }, 500);
  }
});
