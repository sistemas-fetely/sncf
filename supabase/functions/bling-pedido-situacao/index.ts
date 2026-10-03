// Processa a fila de mudança de situação de pedidos de venda no Bling.
// Acesso: cron ou usuário autenticado (um pedido por chamada).
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BLING_BASE, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-cron-secret` };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
async function corpo(res: Response) { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return { texto: t.slice(0, 2000) }; } }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let body: any = {}; try { body = await req.json(); } catch { body = {}; }
  let pedidoId: string | null = null;
  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data: esperado, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !esperado || cron !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
    const { data: u, error } = await sb.auth.getUser(auth.slice(7).trim());
    if (error || !u.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: permitido, error: ePerm } = await sbUser.rpc("tem_permissao", { p_slug: "tela.venda_direta_gestao" });
    if (ePerm) return json({ ok: false, erro: `Falha ao avaliar permissão: ${ePerm.message}` }, 500);
    if (permitido !== true) return json({ ok: false, erro: "Sem permissão (tela.venda_direta_gestao)." }, 403);
    pedidoId = String(body?.pedido_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return json({ ok: false, erro: "pedido_id obrigatório." }, 400);
  }

  let q = sb.from("bling_situacao_fila").select("*").in("status", ["pendente", "erro"]).lt("tentativas", 5).order("criado_em").limit(50);
  if (pedidoId) q = q.eq("pedido_id", pedidoId);
  const { data: filas, error: eFila } = await q;
  if (eFila) return json({ ok: false, erro: `Ler fila: ${eFila.message}` }, 500);
  if (!(filas ?? []).length) return json({ ok: true, processados: 0, erros: 0, detalhes: [] });

  const { data: cfg, error: eCfg } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (eCfg || !cfg) return json({ ok: false, erro: `Configuração do Bling: ${eCfg?.message ?? "ausente"}` }, 500);
  if (!cfg.access_token) return json({ ok: false, erro: "Bling não conectado." }, 409);
  const client = makeBlingClient(sb, cfg as any, await ensureFreshToken(sb, cfg as any));
  const resumo = { processados: 0, erros: 0, detalhes: [] as unknown[] };

  for (const f of filas ?? []) {
    try {
      const res = await fetch(`${BLING_BASE}/pedidos/vendas/${encodeURIComponent(String(f.bling_pedido_id))}/situacoes/${encodeURIComponent(String(f.situacao_alvo_id))}`, {
        method: "PATCH", headers: { Authorization: `Bearer ${client.currentToken()}`, Accept: "application/json", "Content-Type": "application/json" }, body: "{}",
      });
      const c = await corpo(res);
      if (!res.ok) throw new Error(`Bling PATCH ${res.status}: ${c?.message ?? c?.error ?? c?.texto ?? JSON.stringify(c)}`);
      const { error } = await sb.from("bling_situacao_fila").update({ status: "enviado", tentativas: Number(f.tentativas ?? 0) + 1, ultimo_erro: null, resposta: c, processado_em: new Date().toISOString() }).eq("id", f.id);
      if (error) throw new Error(`Gravar fila enviada: ${error.message}`);
      resumo.processados++; resumo.detalhes.push({ pedido_id: f.pedido_id, resultado: "enviado" });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await sb.from("bling_situacao_fila").update({ status: "erro", tentativas: Number(f.tentativas ?? 0) + 1, ultimo_erro: erro }).eq("id", f.id);
      resumo.erros++; resumo.detalhes.push({ pedido_id: f.pedido_id, erro });
    }
  }
  return json({ ok: resumo.erros === 0, ...resumo }, resumo.erros ? 502 : 200);
});