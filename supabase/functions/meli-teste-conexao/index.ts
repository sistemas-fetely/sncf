// Mercado Livre — teste de conexão (TI › Integrações). Sem dados de comprador no retorno.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { meliFetch } from "../_shared/meli/token.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const Body = z.object({ conta: z.string().min(1).max(60) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const p = await exigirAcao(db, req.headers.get("Authorization"), "acao.credenciais_integracao.gravar", "testar o Mercado Livre");
  if (!p.ok || !p.userId) return json({ ok: false, status: null, mensagem: p.erro ?? "Não autorizado" }, p.ok ? 401 : p.status);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ ok: false, status: null, mensagem: "Informe uma conta válida" }, 400);
  const conta = parsed.data.conta;
  const { data: c, error } = await db.from("meli_conta").select("seller_id").eq("codigo", conta).maybeSingle();
  if (error) return json({ ok: false, status: null, mensagem: `Falha ao ler a conta: ${error.message}` }, 500);
  if (!c) return json({ ok: false, status: null, mensagem: "Conta Mercado Livre não cadastrada" }, 400);
  if (!c.seller_id) return json({ ok: false, status: null, mensagem: "Conta ainda não conectada" }, 400);
  try {
    const r1 = await meliFetch(db, conta, "/users/me");
    const me: any = await r1.json().catch(() => ({}));
    if (!r1.ok) return json({ ok: false, status: r1.status, mensagem: "Mercado Livre recusou /users/me" });
    const r2 = await meliFetch(db, conta, `/orders/search?seller=${Number(me.id ?? c.seller_id)}&limit=1&sort=date_desc`);
    const o: any = await r2.json().catch(() => ({}));
    if (!r2.ok) return json({ ok: false, status: r2.status, mensagem: "Conta OK, mas a busca de pedidos foi recusada", nickname: me.nickname ?? null, seller_id: me.id ?? null });
    return json({ ok: true, status: r2.status, mensagem: "Conexão OK", nickname: me.nickname ?? null, seller_id: me.id ?? null, total_pedidos: o?.paging?.total ?? null });
  } catch (e) {
    return json({ ok: false, status: null, mensagem: e instanceof Error ? e.message : String(e) });
  }
});
