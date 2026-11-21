import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { autenticarXpm, type XpmConfig } from "../_shared/xpm-auth.ts";
import { autorizarSync } from "./auth.ts";
import { BodySchema } from "./body.ts";
import { sincronizarRecebimentos, type ResultadoSync } from "./sync.ts";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-cron-secret`,
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const falha = (message: string, status: number) => json({
  ok: false, paginas: 0, recebimentos: 0, itens: 0, mais_antigo: null, erros: [message],
} satisfies ResultadoSync, status);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return falha("Método permitido: POST.", 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return falha("Configuração interna indisponível.", 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });
  try {
    await autorizarSync(req, sb);
  } catch (error) {
    return falha(error instanceof Error ? error.message : String(error), 403);
  }
  let body: unknown;
  try {
    const text = await req.text();
    body = text.trim() ? JSON.parse(text) : {};
  } catch {
    return falha("Body deve ser JSON válido.", 400);
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return falha(`Body inválido: ${parsed.error.message}`, 400);

  let redigir = (message: string) => message;
  try {
    let cfg: XpmConfig | null = null;
    for (const sistema of ["zenlog_prd", "zenlog"]) {
      const { data, error } = await sb.from("integracoes_config").select("config").eq("sistema", sistema).maybeSingle();
      if (error) throw new Error(`config ${sistema}: ${error.message}`);
      if (data?.config) {
        cfg = data.config as XpmConfig;
        break;
      }
    }
    if (!cfg) throw new Error("Config XPM não encontrada (zenlog_prd/zenlog).");
    if (cfg.base_url?.replace(/\/$/, "") !== "https://api.zenlog.com.br") {
      throw new Error("Recebimentos XPM exigem a API de produção configurada.");
    }
    const auth = await autenticarXpm(sb, cfg, (input, init) => fetch(input, {
      ...init, signal: AbortSignal.timeout(30_000),
    }));
    redigir = auth.redigir;
    const base = cfg.base_url.replace(/\/$/, "");
    const resultado = await sincronizarRecebimentos(parsed.data, {
      get: async (path) => {
        const response = await fetch(`${base}${path}`, {
          method: "GET", redirect: "error",
          headers: { Accept: "application/json", Authorization: `Bearer ${auth.token}` },
          signal: AbortSignal.timeout(30_000),
        });
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text); } catch {
          throw new Error(redigir(`XPM HTTP ${response.status}: resposta não JSON: ${text || response.statusText}`).slice(0, 1000));
        }
        if (!response.ok || payload?.success === false || payload?.error) {
          throw new Error(redigir(`XPM HTTP ${response.status}: ${payload?.error?.message ?? response.statusText}`));
        }
        return payload.result;
      },
      upsert: async (items) => {
        const { data, error } = await sb.rpc("fn_xpm_recebimento_upsert", { p_items: items });
        if (error) throw new Error(`fn_xpm_recebimento_upsert: ${error.message}`);
        if (!data || !Number.isInteger(data.recebimentos) || data.recebimentos < 0 ||
          !Number.isInteger(data.itens) || data.itens < 0 || data.ok === false) {
          throw new Error("fn_xpm_recebimento_upsert: contagem inválida.");
        }
        return { recebimentos: data.recebimentos, itens: data.itens };
      },
    });
    resultado.erros = resultado.erros.map(redigir);
    return json(resultado, resultado.ok ? 200 : 502);
  } catch (error) {
    return falha(redigir(error instanceof Error ? error.message : String(error)), 502);
  }
});