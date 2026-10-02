// Sincroniza links Safrapay abertos: detecta pagamento e confirma o cartão.
// Acesso: cron (x-cron-secret) ou usuário com tela.venda_direta_gestao (um pedido).
// NUNCA loga nem devolve o MerchantToken ou o accessToken.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-cron-secret` };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function lerCorpo(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return { texto: t.slice(0, 2000) }; }
}
const msgApi = (c: any, s: number) => {
  const m = c?.errors?.map?.((e: any) => e?.message ?? JSON.stringify(e)).join("; ") || c?.message || c?.error || c?.title || c?.texto;
  return `Safrapay HTTP ${s}${m ? `: ${typeof m === "string" ? m : JSON.stringify(m)}` : ""}`;
};
const primeiro = (...v: unknown[]) => v.find((x) => x !== undefined && x !== null && x !== "");

/**
 * Data do Safra com fuso correto.
 * captureDateTime vem SEM fuso em horário de Brasília ("2026-10-02T15:55:01.109" = 15h55 em SP) —
 * quando a string não tem Z nem offset, interpretar como -03:00 (America/Sao_Paulo).
 * addedAtUtc vem em UTC (o nome diz) — quando não tem Z nem offset, interpretar como Z.
 */
function dataSafra(v: unknown, utc: boolean): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const temFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
  const comFuso = temFuso ? s : `${s}${utc ? "Z" : "-03:00"}`;
  const d = new Date(comFuso);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Leitura da charge (formato confirmado em homologação 02/10).
 * NSU de verdade = transactions[].transactionId da transação aprovada (12 dígitos,
 * o que sai no comprovante e no relatório). charges[].nsu é numeração interna.
 */
function lerCharge(c: any) {
  const txs: any[] = Array.isArray(c?.transactions) ? c.transactions : [];
  const aprovadas = txs.filter((t) => String(t?.authorizationResponseCode ?? "") === "00" || Number(t?.transactionStatus) === 2);
  const ts = (t: any) => { const v = dataSafra(t?.captureDateTime, false); return v ? Date.parse(v) : 0; };
  const tx = aprovadas.sort((a, b) => ts(b) - ts(a))[0] ?? null;
  const status = Number(primeiro(c?.chargeStatus, c?.status));
  const id = primeiro(c?.id, c?.chargeId);
  const nsu = primeiro(tx?.transactionId, tx?.nsu, c?.nsu);
  const amountRaw = primeiro(tx?.amount, c?.amount, c?.totalAmount);
  const data = primeiro(tx?.captureDateTime, c?.addedAtUtc);
  return {
    status, id: id != null ? String(id) : null, nsu: nsu != null ? String(nsu) : null,
    valorCentavos: amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    data: data ? new Date(String(data)).toISOString() : new Date().toISOString(),
    aut: tx?.authorizationCode != null ? String(tx.authorizationCode) : null,
    bandeira: tx?.card?.brandName ?? null,
    final: tx?.card?.lastFourDigits ?? null,
    parcelas: tx?.installmentNumber ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  let pedidoId: string | null = null;

  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: esperado, error } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
    if (error || !esperado) return json({ ok: false, erro: "Não foi possível validar o x-cron-secret." }, 401);
    if (cronSecret !== esperado) return json({ ok: false, erro: "x-cron-secret inválido." }, 401);
    if (body?.pedido_id) pedidoId = String(body.pedido_id);
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
    const { data: u, error: eU } = await sb.auth.getUser(auth.slice(7).trim());
    if (eU || !u?.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: ok, error: eP } = await sbUser.rpc("tem_permissao", { p_slug: "tela.venda_direta_gestao" });
    if (eP) return json({ ok: false, erro: `Falha ao avaliar permissão: ${eP.message}` }, 500);
    if (ok !== true) return json({ ok: false, erro: "Sem permissão (tela.venda_direta_gestao)." }, 403);
    pedidoId = String(body?.pedido_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return json({ ok: false, erro: "pedido_id obrigatório." }, 400);
  }

  const { data: cfg, error: eCfg } = await sb.from("safrapay_config").select("*").eq("id", 1).maybeSingle();
  if (eCfg || !cfg) return json({ ok: false, erro: `Ler configuração Safrapay: ${eCfg?.message ?? "ausente"}` }, 500);
  if (!cfg.ativo) return json({ ok: false, erro: "Integração Safrapay aguardando ativação (MerchantToken)." }, 409);

  let q = sb.from("pagamento_link").select("*").eq("gateway", "safrapay").eq("status", "aberto")
    .order("criado_em", { ascending: true }).limit(50);
  if (pedidoId) q = q.eq("pedido_id", pedidoId);
  const { data: links, error: eL } = await q;
  if (eL) return json({ ok: false, erro: `Ler links: ${eL.message}` }, 500);

  const resumo = { verificados: 0, pagos: 0, expirados: 0, cancelados: 0, erros: 0, detalhes: [] as unknown[] };
  const tokens = new Map<string, string>();

  async function token(amb: string): Promise<{ api: string; bearer: string }> {
    const api = String(cfg[`url_api_${amb}`] ?? "").replace(/\/+$/, "");
    const segredo = cfg[`segredo_token_${amb}`];
    if (!api || !segredo) throw new Error(`Configuração Safrapay incompleta para ${amb}.`);
    if (tokens.has(amb)) return { api, bearer: tokens.get(amb)! };
    const { data: mt, error } = await sb.rpc("get_vault_secret", { p_name: segredo });
    if (error || !mt) throw new Error(`MerchantToken indisponível (${segredo}).`);
    const r = await fetch(`${api}/v2/merchant/auth`, { method: "POST", headers: { Authorization: String(mt), "Content-Type": "application/json" } });
    const c = await lerCorpo(r);
    const at = c?.accessToken ?? c?.data?.accessToken;
    if (!r.ok || !at) throw new Error(`Autenticação: ${msgApi(c, r.status)}`);
    tokens.set(amb, at);
    return { api, bearer: at };
  }

  for (const l of links ?? []) {
    resumo.verificados++;
    const base: any = { ultimo_sync_em: new Date().toISOString(), tentativas_sync: (l.tentativas_sync ?? 0) + 1 };
    try {
      if (!l.gateway_link_id) throw new Error("Link sem gateway_link_id.");
      const { api, bearer } = await token(l.ambiente === "prod" ? "prod" : "hml");
      const r = await fetch(`${api}/v2/smartcheckout/${encodeURIComponent(l.gateway_link_id)}/detail`, {
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      });
      const c = await lerCorpo(r);
      base.resposta_ultimo_sync = c;
      if (!r.ok) throw new Error(`Consultar: ${msgApi(c, r.status)}`);
      const sc = c?.smartCheckout ?? c?.data?.smartCheckout ?? c?.data ?? c;
      const scStatus = Number(sc?.status);
      const charges = (Array.isArray(sc?.charges) ? sc.charges : []).map(lerCharge);
      const paga = charges.find((ch: any) => ch.status === 1);
      const pre = charges.find((ch: any) => ch.status === 2);

      if (paga) {
        const valorPago = paga.valorCentavos != null ? paga.valorCentavos / 100 : Number(l.valor);
        const { data: atual } = await sb.from("pagamento_link").select("status").eq("id", l.id).maybeSingle();
        if (atual?.status === "pago") { resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "já pago" }); continue; }
        const { error: eRpc } = await sb.rpc("confirmar_cartao_capturado", {
          p_pedido_id: l.pedido_id,
          p_nsu: paga.nsu ?? paga.id,
          p_data_captura: paga.data,
          p_valor_capturado: valorPago,
          p_observacao: `Safrapay link ${l.gateway_link_id} · charge ${paga.id}`,
          p_adquirente_id: cfg.adquirente_id,
        });
        if (eRpc) {
          const erro = `Pago na Safrapay, mas a confirmação falhou: ${eRpc.message}`;
          await sb.from("pagamento_link").update({ ...base, erro, charge_id: paga.id, nsu: paga.nsu, valor_pago: valorPago, pago_em: paga.data }).eq("id", l.id);
          resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
          continue;
        }
        const { error: eUp } = await sb.from("pagamento_link").update({
          ...base, status: "pago", erro: null, charge_id: paga.id, nsu: paga.nsu, valor_pago: valorPago, pago_em: paga.data,
        }).eq("id", l.id);
        if (eUp) throw new Error(`Gravar pagamento: ${eUp.message}`);
        resumo.pagos++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "pago" });
      } else if (pre) {
        await sb.from("pagamento_link").update({ ...base, erro: "Pré-autorizada — capturar manualmente", charge_id: pre.id, nsu: pre.nsu }).eq("id", l.id);
        resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro: "Pré-autorizada — capturar manualmente" });
      } else if (scStatus === 101 || scStatus === 102 || scStatus === 100) {
        await sb.from("pagamento_link").update({ ...base, status: "expirado" }).eq("id", l.id);
        resumo.expirados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "expirado" });
      } else if (scStatus === 3) {
        await sb.from("pagamento_link").update({ ...base, status: "cancelado" }).eq("id", l.id);
        resumo.cancelados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "cancelado" });
      } else {
        const { error } = await sb.from("pagamento_link").update(base).eq("id", l.id);
        if (error) throw new Error(`Gravar sync: ${error.message}`);
        resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "aguardando pagamento" });
      }
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await sb.from("pagamento_link").update({ ...base, erro }).eq("id", l.id);
      resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
      console.error("[safrapay-link-sync]", { pedido_id: l.pedido_id, erro });
    }
  }
  return json({ ok: true, ...resumo });
});
