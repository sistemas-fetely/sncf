// Teste de conexão Mercado Pago (TI > Integrações > Mercado Pago). Lê mp_access_token do Vault e
// chama GET release_report/config. 404 (config inexistente) = token válido. Nunca devolve o token.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await db.auth.getUser(auth.replace("Bearer ", ""));
  if (!u?.user) return json({ ok: false, status: null, mensagem: "Não autorizado" }, 401);
  const { data: pode, error: pe } = await db.rpc("usuario_tem_acao", { p_slug: "acao.credenciais_integracao.gravar", p_user_id: u.user.id });
  if (pe) return json({ ok: false, status: null, mensagem: `Falha ao checar permissão: ${pe.message}` }, 500);
  if (!pode) return json({ ok: false, status: null, mensagem: "Sem permissão (acao.credenciais_integracao.gravar)" }, 403);

  const { data: token, error: te } = await db.rpc("get_vault_secret", { p_name: "mp_access_token" });
  if (te) return json({ ok: false, status: null, mensagem: `Falha ao ler o cofre: ${te.message}` }, 500);
  if (!token) return json({ ok: false, status: null, mensagem: "credencial mp_access_token não cadastrada" }, 400);

  try {
    const r = await fetch("https://api.mercadopago.com/v1/account/release_report/config", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const txt = (await r.text()).replaceAll(String(token), "***").slice(0, 600);
    const ok = r.ok || r.status === 404;
    const mensagem = r.ok ? "Conexão OK — configuração de relatório encontrada"
      : r.status === 404 ? "Conexão OK — token válido; configuração do relatório ainda não criada"
      : r.status === 401 || r.status === 403 ? "Token recusado pelo Mercado Pago" : "Mercado Pago respondeu com erro";
    return json({ ok, status: r.status, mensagem, corpo: txt });
  } catch (e) {
    return json({ ok: false, status: null, mensagem: `Falha de rede: ${(e as Error).message}` }, 502);
  }
});
