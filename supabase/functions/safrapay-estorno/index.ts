// Solicita estorno total de uma venda direta paga por cartão no Safrapay.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
async function ler(res: Response) { const t = await res.text(); try { return t ? JSON.parse(t) : null; } catch { return { texto: t.slice(0, 2000) }; } }
const msg = (c: any, s: number) => c?.errors?.map?.((e: any) => e?.message ?? JSON.stringify(e)).join("; ") || c?.message || c?.error || c?.title || c?.texto || `Safrapay HTTP ${s}`;
const statusTexto = (c: any) => String(c?.transactionStatus ?? c?.chargeStatus ?? c?.data?.transactionStatus ?? c?.data?.chargeStatus ?? "").toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
  const { data: u, error: eU } = await sb.auth.getUser(auth.slice(7).trim());
  if (eU || !u.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
  const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: permitido, error: ePerm } = await sbUser.rpc("usuario_tem_acao", { p_slug: "acao.vd_devolucao_aprovar" });
  if (ePerm) return json({ ok: false, erro: `Falha ao avaliar permissão: ${ePerm.message}` }, 500);
  if (permitido !== true) return json({ ok: false, erro: "Sem permissão para aprovar devoluções." }, 403);
  let body: any; try { body = await req.json(); } catch { return json({ ok: false, erro: "Corpo JSON inválido." }, 400); }
  const id = String(body?.devolucao_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, erro: "devolucao_id inválido." }, 400);
  const { data: d, error: eD } = await sb.from("vd_devolucao").select("*").eq("id", id).maybeSingle();
  if (eD || !d) return json({ ok: false, erro: `Ler devolução: ${eD?.message ?? "não encontrada"}` }, eD ? 500 : 404);
  if (!["aprovada", "falhou"].includes(String(d.status)) || d.meio !== "cartao" || !d.charge_id) return json({ ok: false, erro: "Devolução precisa estar aprovada, ser de cartão e ter charge_id." }, 409);

  const { data: cfg, error: eCfg } = await sb.from("safrapay_config").select("*").eq("id", 1).maybeSingle();
  if (eCfg || !cfg) return json({ ok: false, erro: `Ler configuração Safrapay: ${eCfg?.message ?? "ausente"}` }, 500);
  const amb = cfg.ambiente === "prod" ? "prod" : "hml";
  const api = String(cfg[`url_api_${amb}`] ?? "").replace(/\/+$/, "");
  const segredo = cfg[`segredo_token_${amb}`];
  if (!api || !segredo) return json({ ok: false, erro: `Configuração Safrapay incompleta para ${amb}.` }, 500);
  const { data: merchantToken, error: eToken } = await sb.rpc("get_vault_secret", { p_name: segredo });
  if (eToken || !merchantToken) return json({ ok: false, erro: `MerchantToken indisponível (${segredo}).` }, 500);
  const rAuth = await fetch(`${api}/v2/merchant/auth`, { method: "POST", headers: { Authorization: String(merchantToken), "Content-Type": "application/json" } });
  const cAuth = await ler(rAuth); const bearer = cAuth?.accessToken ?? cAuth?.data?.accessToken;
  if (!rAuth.ok || !bearer) return json({ ok: false, erro: `Autenticação Safrapay: ${msg(cAuth, rAuth.status)}` }, 502);
  const res = await fetch(`${api}/v2/charge/cancelation/${encodeURIComponent(d.charge_id)}`, { method: "PUT", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: "{}" });
  const c = await ler(res);
  const texto = statusTexto(c);
  const cancelado = c?.canceled === true || texto === "canceled" || texto === "cancelled";
  const pendente = /pendingcancel/.test(texto) || (c?.canceled === false && c?.success !== false && res.ok);
  if (!res.ok || c?.success === false || (!cancelado && !pendente)) {
    const erro = String(msg(c, res.status));
    await sb.from("vd_devolucao").update({ status: "falhou", erro, gateway_resposta: c }).eq("id", id);
    return json({ ok: false, erro }, 502);
  }
  if (cancelado) {
    const trace = c?.traceKey ?? c?.data?.traceKey ?? "sem traceKey";
    const { error: eResposta } = await sb.from("vd_devolucao").update({ gateway_resposta: c, erro: null }).eq("id", id);
    if (eResposta) return json({ ok: false, erro: `Estorno aceito, mas gravar resposta falhou: ${eResposta.message}` }, 500);
    const { error } = await sb.rpc("vd_concluir_devolucao", { p_devolucao_id: id, p_prova_tipo: "safrapay_estorno", p_prova_ref: d.charge_id, p_obs: `Safrapay ${trace}` });
    if (error) return json({ ok: false, erro: `Estorno aceito, mas concluir devolução falhou: ${error.message}` }, 500);
    return json({ ok: true, status: "concluida", gateway_resposta: c });
  }
  const { error: eUp } = await sb.from("vd_devolucao").update({ status: "estorno_enviado", erro: null, gateway_resposta: c }).eq("id", id);
  if (eUp) return json({ ok: false, erro: `Estorno enviado, mas gravar status falhou: ${eUp.message}` }, 500);
  return json({ ok: true, status: "estorno_enviado", gateway_resposta: c });
});