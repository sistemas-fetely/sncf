// Teste de conexão Mercado Pago (TI > Integrações > Mercado Pago). Resolve o segredo pela conta e
// chama GET release_report/config. 404 (config inexistente) = token válido. Nunca devolve o token.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { codigoConta } from "./conta.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, status: null, mensagem: "Configuração do serviço indisponível" }, 500);
  const db = createClient(url, serviceKey);
  const auth = req.headers.get("Authorization") ?? "";
  const { data: u } = await db.auth.getUser(auth.replace("Bearer ", ""));
  if (!u?.user) return json({ ok: false, status: null, mensagem: "Não autorizado" }, 401);
  const { data: pode, error: pe } = await db.rpc("usuario_tem_acao", { p_slug: "acao.credenciais_integracao.gravar", p_user_id: u.user.id });
  if (pe) return json({ ok: false, status: null, mensagem: `Falha ao checar permissão: ${pe.message}` }, 500);
  if (!pode) return json({ ok: false, status: null, mensagem: "Sem permissão (acao.credenciais_integracao.gravar)" }, 403);

  let conta: string;
  try {
    const texto = await req.text();
    conta = codigoConta(texto.trim() ? JSON.parse(texto) : {});
  } catch {
    return json({ ok: false, status: null, mensagem: "Informe uma conta válida" }, 400);
  }
  const { data: dim, error: de } = await db.from("mp_conta_dim").select("segredo_cofre").eq("codigo", conta).maybeSingle();
  if (de) return json({ ok: false, status: null, mensagem: `Falha ao ler a conta: ${de.message}` }, 500);
  if (!dim?.segredo_cofre) return json({ ok: false, status: null, mensagem: "Conta Mercado Pago não cadastrada" }, 400);
  const { data: token, error: te } = await db.rpc("get_vault_secret", { p_name: dim.segredo_cofre });
  if (te) return json({ ok: false, status: null, mensagem: `Falha ao ler o cofre: ${te.message}` }, 500);
  if (!token) return json({ ok: false, status: null, mensagem: `credencial ${dim.segredo_cofre} não cadastrada` }, 400);

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
    return json({ ok: false, status: null, mensagem: `Falha de rede: ${String(e instanceof Error ? e.message : e).replaceAll(String(token), "***")}` }, 502);
  }
});
