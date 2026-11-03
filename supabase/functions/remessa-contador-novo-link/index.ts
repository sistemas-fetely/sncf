// Pacote do Contador v2: novo link (signed URL) sobre os mesmos arquivos e, opcionalmente, reenvio do e-mail.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { assinarPartes, enviarEmailRemessa } from "../_shared/pacote-contador/remessa.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const msg = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const userDb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims } = await userDb.auth.getClaims(auth.slice(7));
  if (!claims?.claims?.sub) return json({ ok: false, erro: "Sessão inválida" }, 401);
  const { data: pode, error: pe } = await userDb.rpc("pode_ler_tabela", { p_tabela: "remessas_contador" });
  if (pe) return json({ ok: false, erro: pe.message }, 500);
  if (!pode) return json({ ok: false, erro: "Sem permissão para o pacote do contador" }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "JSON inválido" }, 400); }
  const id = String(body?.remessa_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, erro: "remessa_id inválido" }, 400);
  const reenviar = body?.reenviar === true;
  try {
    const admin = createClient(url, service);
    const { data: rem, error } = await admin.from("remessas_contador").select("*").eq("id", id).single();
    if (error) throw error;
    if (rem.status !== "pronto") throw new Error(`Remessa em '${rem.status ?? "formato antigo"}' — só pacotes prontos ganham novo link.`);
    if (!rem.partes?.length) throw new Error("Remessa sem partes gravadas.");
    const { partes, expira } = await assinarPartes(admin, rem.partes);
    const { error: ue } = await admin.from("remessas_contador").update({ partes, link_signed: partes[0].link, link_expira_em: expira }).eq("id", id);
    if (ue) throw ue;
    let email: { enviados: number; erros: string[] } | null = null;
    if (reenviar) {
      if (!(rem.destinatarios ?? []).length) throw new Error("Remessa sem destinatários — não há para quem reenviar.");
      email = await enviarEmailRemessa({ supabaseUrl: url, anonKey: anon, authHeader: auth, remessa: rem, partes, expira, motivo: "reenvio" });
      if (email.enviados === 0) throw new Error(`Nenhum e-mail enviado: ${email.erros.join("; ")}`);
    }
    return json({ ok: true, link_expira_em: expira, partes: partes.length, email });
  } catch (e) { return json({ ok: false, erro: msg(e) }, 500); }
});
