// Recebimento XPM · termo HTML por e-mail (10/11/2026, OK Flavio).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dataBrasilia, parsearTermoEmail } from "./parser.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-internal-key` };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const mensagem = (e: unknown) => e instanceof Error ? e.message : String(e);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "método" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "Configuração do ambiente ausente." }, 500);
  const sb = createClient(url, key);

  let resendKey = "";
  try {
    const { data: ik, error: ei } = await sb.rpc("get_vault_secret", { p_name: "INTERNAL_EDGE_KEY" });
    const { data: rk, error: er } = await sb.rpc("get_vault_secret", { p_name: "resend_api_key" });
    if (ei || er) throw new Error(`Vault: ${ei?.message ?? er?.message}`);
    resendKey = String(rk ?? "");
    const interna = String(ik ?? "") || resendKey;
    if (!interna || req.headers.get("x-internal-key") !== interna) return json({ error: "Unauthorized" }, 401);
  } catch (e) { return json({ error: mensagem(e) }, 500); }

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const emailId = body && typeof body === "object" && "resend_email_id" in body && typeof body.resend_email_id === "string"
    ? body.resend_email_id.trim() : "";
  if (!emailId || emailId.length > 255) return json({ error: "Informe resend_email_id válido." }, 400);

  const log: Record<string, unknown> = {
    resend_email_id: emailId, recebido_em: new Date().toISOString(), remetente: null,
    assunto: null, data_email: null, termo_entrada_id: null, linhas_lidas: 0, resultado: null, erro: null,
  };
  try {
    const { data: ja, error: ej } = await sb.from("xpm_termo_email_log").select("id, erro")
      .eq("resend_email_id", emailId).maybeSingle();
    if (ej) throw new Error(`Idempotência: ${ej.message}`);
    if (ja && ja.erro === null) return json({ duplicado: true });
    if (!resendKey) throw new Error("resend_api_key ausente no Vault.");
    const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${resendKey}` },
    });
    if (!r.ok) throw new Error(`Resend GET ${r.status}: ${(await r.text()).slice(0, 500)}`);
    const email = await r.json();
    log.remetente = email.from ?? null;
    log.assunto = String(email.subject ?? "");
    const dataEmail = String(email.created_at ?? email.date ?? "");
    const dataRecebimento = dataBrasilia(dataEmail);
    log.data_email = new Date(dataEmail).toISOString();
    const rows = parsearTermoEmail(String(email.html ?? ""));
    log.linhas_lidas = rows.length;
    const { data: resultado, error } = await sb.rpc("ingerir_termo_conferencia", {
      p_termo: String(log.assunto).replace(/^(?:\s*(?:ENC|FW|FWD|RES|RE|TR)\s*:\s*)+/i, ""), p_rows: rows, p_data_recebimento: dataRecebimento,
      p_centro_codigo: "XPM-SC", p_porta: "xpm",
    });
    log.resultado = resultado;
    log.termo_entrada_id = resultado?.termo_entrada_id ?? null;
    if (error) throw new Error(`ingerir_termo_conferencia: ${error.message}`);
    if (resultado?.erro || resultado?.error || resultado?.ok === false) {
      throw new Error(`ingerir_termo_conferencia: ${resultado.erro ?? resultado.error ?? JSON.stringify(resultado)}`);
    }
  } catch (e) { log.erro = mensagem(e); }

  try {
    const { error } = await sb.from("xpm_termo_email_log").upsert(log, { onConflict: "resend_email_id" });
    if (error) throw new Error(error.message);
  } catch (e) {
    log.erro = [log.erro, `Falha ao gravar xpm_termo_email_log: ${mensagem(e)}`].filter(Boolean).join(" | ");
  }
  console.log(JSON.stringify({ email_id: emailId, assunto: log.assunto, linhas: log.linhas_lidas,
    ...(log.erro ? { erro: log.erro } : { resultado: log.resultado }) }));
  return json({ ok: !log.erro, resultado: log.resultado, erro: log.erro }, log.erro ? 500 : 200);
});