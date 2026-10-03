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
function deleteToleravel(status: number, corpo: any): boolean {
  if (status === 404 || status === 410) return true;
  const m = JSON.stringify(corpo ?? "").toLowerCase();
  return /expir|cancel|already|j[aá] /.test(m);
}
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
  const data = dataSafra(tx?.captureDateTime, false) ?? dataSafra(c?.addedAtUtc, true);
  const casaPix = (v: unknown) => v != null && /pix/i.test(String(v));
  const txPix = txs.find((t) => casaPix(t?.paymentType) || t?.qrCode || t?.qrCodeBase64);
  const ehPix = !!txPix || casaPix(c?.paymentType);
  const pixRef = primeiro(txPix?.endToEndId, tx?.endToEndId, txPix?.transactionId, tx?.transactionId);
  return {
    status, id: id != null ? String(id) : null, nsu: nsu != null ? String(nsu) : null,
    valorCentavos: amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    data: data ?? new Date().toISOString(),
    aut: tx?.authorizationCode != null ? String(tx.authorizationCode) : null,
    bandeira: tx?.card?.brandName ?? null,
    final: tx?.card?.lastFourDigits ?? null,
    parcelas: tx?.installmentNumber ?? null,
    ehPix,
    pixRef: pixRef != null ? String(pixRef) : null,
  };
}

/** Leitura defensiva da cobrança PIX (GET /v2/charge/{id}). */
function lerPix(c: any) {
  const ch = c?.charge ?? c?.data?.charge ?? c?.data ?? c;
  const txs: any[] = Array.isArray(ch?.transactions) ? ch.transactions : [];
  const pagoTx = (t: any) => {
    const s = String(t?.transactionStatus ?? "").trim().toLowerCase();
    return ["paid", "authorized", "captured", "approved", "pago"].includes(s) || Number(t?.transactionStatus) === 2;
  };
  const sCh = String(ch?.chargeStatus ?? ch?.status ?? "").trim().toLowerCase();
  const chPago = sCh === "authorized" || sCh === "paid" || sCh === "captured" || Number(ch?.chargeStatus) === 1;
  const tx = txs.find(pagoTx) ?? (chPago ? txs[0] ?? null : null);
  const pago = !!tx || chPago;
  const cancelado = /cancel|expir/.test(sCh) || Number(ch?.chargeStatus) === 3;
  const id = primeiro(ch?.id, ch?.chargeId);
  const prova = primeiro(tx?.endToEndId, tx?.e2eId, tx?.endToEnd, tx?.transactionId);
  const amountRaw = primeiro(tx?.amount, ch?.amount, ch?.totalAmount);
  const data = dataSafra(primeiro(tx?.paymentDate, tx?.paidAt, tx?.captureDateTime, tx?.transactionDateTime), false)
    ?? dataSafra(primeiro(tx?.addedAtUtc, ch?.addedAtUtc), true);
  return {
    pago, cancelado, id: id != null ? String(id) : null,
    nsu: primeiro(ch?.nsu, tx?.nsu) != null ? String(primeiro(ch?.nsu, tx?.nsu)) : null,
    transactionId: tx?.transactionId != null ? String(tx.transactionId) : null,
    prova: prova != null ? String(prova) : null,
    valorCentavos: amountRaw != null && Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null,
    data: data ?? new Date().toISOString(),
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

  const resumo = { verificados: 0, pagos: 0, expirados: 0, cancelados: 0, estornos_concluidos: 0, erros: 0, detalhes: [] as unknown[] };
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

  // Estornos já enviados: apenas consulta; nunca reenvia o cancelamento.
  let qEst = sb.from("vd_devolucao").select("id,pedido_id,charge_id").eq("status", "estorno_enviado").order("atualizado_em").limit(50);
  if (pedidoId) qEst = qEst.eq("pedido_id", pedidoId);
  const { data: estornos, error: eEst } = await qEst;
  if (eEst) return json({ ok: false, erro: `Ler estornos pendentes: ${eEst.message}` }, 500);
  for (const d of estornos ?? []) {
    try {
      if (!d.charge_id) throw new Error("Devolução sem charge_id.");
      const amb = cfg.ambiente === "prod" ? "prod" : "hml";
      const { api, bearer } = await token(amb);
      const r = await fetch(`${api}/v2/charge/${encodeURIComponent(d.charge_id)}`, { headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" } });
      const c = await lerCorpo(r);
      if (!r.ok) throw new Error(`Consultar estorno: ${msgApi(c, r.status)}`);
      const ch = c?.charge ?? c?.data?.charge ?? c?.data ?? c;
      const s = String(primeiro(ch?.transactionStatus, ch?.chargeStatus, ch?.status) ?? "").toLowerCase();
      const cancelado = ch?.isCanceled === true || ch?.canceled === true || /cancelled|canceled/.test(s);
      if (cancelado) {
        const trace = primeiro(c?.traceKey, c?.data?.traceKey, ch?.traceKey) ?? "sem traceKey";
        const { error } = await sb.rpc("vd_concluir_devolucao", { p_devolucao_id: d.id, p_prova_tipo: "safrapay_estorno", p_prova_ref: d.charge_id, p_obs: `Safrapay ${trace}` });
        if (error) throw new Error(`Concluir devolução: ${error.message}`);
        resumo.estornos_concluidos++; resumo.detalhes.push({ pedido_id: d.pedido_id, resultado: "estorno concluído" });
      } else {
        const { error } = await sb.from("vd_devolucao").update({ gateway_resposta: c }).eq("id", d.id);
        if (error) throw new Error(`Gravar consulta do estorno: ${error.message}`);
      }
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await sb.from("vd_devolucao").update({ erro }).eq("id", d.id);
      resumo.erros++; resumo.detalhes.push({ pedido_id: d.pedido_id, erro });
    }
  }

  // 1) Pedido cancelado não pode ter link pagável — roda antes de procurar pagamentos.
  const pedidoIds = [...new Set((links ?? []).map((l: any) => l.pedido_id))];
  const cancelados = new Set<string>();
  const formaPedido = new Map<string, string>();
  if (pedidoIds.length) {
    const { data: peds, error: ePd } = await sb.from("pedidos").select("id, cancelado_em, estagio, forma_solicitada").in("id", pedidoIds);
    if (ePd) return json({ ok: false, erro: `Ler pedidos: ${ePd.message}` }, 500);
    for (const p of peds ?? []) {
      formaPedido.set(p.id, String(p.forma_solicitada ?? ""));
      if (p.cancelado_em || p.estagio === "cancelado") cancelados.add(p.id);
    }
  }
  // 1b) Portão substituído (troca de meio / remontar): link aberto sem provisão ou com provisão cancelada.
  const obsoletos = new Set<string>();
  const provIds = [...new Set((links ?? []).filter((l: any) => l.status === "aberto" && l.provisao_id).map((l: any) => l.provisao_id))];
  const provCancelada = new Set<string>();
  if (provIds.length) {
    const { data: pvs, error: ePv } = await sb.from("provisao_recebimento").select("id, status").in("id", provIds);
    if (ePv) return json({ ok: false, erro: `Ler provisões: ${ePv.message}` }, 500);
    for (const p of pvs ?? []) if (["cancelada", "cancelado"].includes(String(p.status))) provCancelada.add(p.id);
  }
  for (const l of links ?? []) {
    if (cancelados.has(l.pedido_id) || l.status !== "aberto") continue;
    if (!l.provisao_id || provCancelada.has(l.provisao_id)) obsoletos.add(l.id);
  }
  for (const l of (links ?? []).filter((x: any) => cancelados.has(x.pedido_id) || obsoletos.has(x.id))) {
    const subst = !cancelados.has(l.pedido_id);
    const msgAprov = subst ? "Portão substituído com pagamento aprovado — estornar" : "Pedido cancelado com pagamento aprovado — estornar";
    const msgLink = subst ? "Portão substituído — link cancelado no Safra" : "Pedido cancelado — link cancelado no Safra";
    const msgPix = subst ? "Portão substituído — link cancelado no Safra" : "Pedido cancelado — PIX cancelado no Safra";
    const motivo = subst ? "portão substituído" : "pedido cancelado";
    resumo.verificados++;
    const base: any = { ultimo_sync_em: new Date().toISOString(), tentativas_sync: (l.tentativas_sync ?? 0) + 1 };
    try {
      const amb = l.ambiente === "prod" ? "prod" : "hml";
      if (!l.gateway_link_id) {
        const { error } = await sb.from("pagamento_link").update({ ...base, status: "cancelado", erro: msgLink }).eq("id", l.id);
        if (error) throw new Error(`Gravar cancelamento: ${error.message}`);
        resumo.cancelados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: `cancelado (${motivo})` });
        continue;
      }
      const { api, bearer } = await token(amb);
      if (l.meio === "pix") {
        const rP = await fetch(`${api}/v2/charge/${encodeURIComponent(l.gateway_link_id)}`, {
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        });
        const cP = await lerCorpo(rP);
        if (!rP.ok) throw new Error(`Consultar PIX antes de cancelar: ${msgApi(cP, rP.status)}`);
        if (lerPix(cP).pago) {
          const erro = msgAprov;
          const { error } = await sb.from("pagamento_link").update({ ...base, erro, resposta_ultimo_sync: cP }).eq("id", l.id);
          if (error) throw new Error(`Gravar alerta: ${error.message}`);
          resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
          continue;
        }
        const mId = String(cfg[`merchant_id_${amb}`] ?? "").trim();
        if (!mId) throw new Error(`merchant_id_${amb} ausente em safrapay_config — não dá para cancelar o PIX.`);
        const rDp = await fetch(`${api}/v2/charge/${encodeURIComponent(l.gateway_link_id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${bearer}`, MerchantId: mId },
        });
        const cDp = await lerCorpo(rDp);
        if (!rDp.ok && !deleteToleravel(rDp.status, cDp)) throw new Error(`Cancelar PIX no Safra: ${msgApi(cDp, rDp.status)}`);
        const { error } = await sb.from("pagamento_link").update({ ...base, status: "cancelado", erro: msgPix, resposta_ultimo_sync: cP }).eq("id", l.id);
        if (error) throw new Error(`Gravar cancelamento: ${error.message}`);
        resumo.cancelados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: `PIX cancelado (${motivo})` });
        continue;
      }
      // Já tem cobrança aprovada? Então não cancela — vai para estorno manual.
      const rC = await fetch(`${api}/v2/smartcheckout/${encodeURIComponent(l.gateway_link_id)}/detail`, {
        headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
      });
      const cC = await lerCorpo(rC);
      if (!rC.ok) throw new Error(`Consultar antes de cancelar: ${msgApi(cC, rC.status)}`);
      const scC = cC?.smartCheckout ?? cC?.data?.smartCheckout ?? cC?.data ?? cC;
      const chs = Array.isArray(scC?.charges) ? scC.charges : [];
      const aprovado = Number(scC?.status) === 100 || chs.some((c: any) => Number(primeiro(c?.chargeStatus, c?.status)) === 1);
      if (aprovado) {
        const erro = msgAprov;
        const { error } = await sb.from("pagamento_link").update({ ...base, erro, resposta_ultimo_sync: cC }).eq("id", l.id);
        if (error) throw new Error(`Gravar alerta: ${error.message}`);
        resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
        continue;
      }
      const merchantId = String(cfg[`merchant_id_${amb}`] ?? "").trim();
      if (!merchantId) throw new Error(`merchant_id_${amb} ausente em safrapay_config — não dá para cancelar o link.`);
      const rD = await fetch(`${api}/v2/smartcheckout/${encodeURIComponent(l.gateway_link_id)}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${bearer}`, MerchantId: merchantId },
      });
      const cD = await lerCorpo(rD);
      if (!rD.ok && !deleteToleravel(rD.status, cD)) throw new Error(`Cancelar link no Safra: ${msgApi(cD, rD.status)}`);
      const { error } = await sb.from("pagamento_link").update({ ...base, status: "cancelado", erro: msgLink }).eq("id", l.id);
      if (error) throw new Error(`Gravar cancelamento: ${error.message}`);
      resumo.cancelados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: `cancelado (${motivo})` });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await sb.from("pagamento_link").update({ ...base, erro }).eq("id", l.id);
      resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
      console.error("[safrapay-link-sync] cancelar", { pedido_id: l.pedido_id, erro });
    }
  }

  // 2) Procurar pagamentos nos demais.
  for (const l of (links ?? []).filter((x: any) => !cancelados.has(x.pedido_id) && !obsoletos.has(x.id))) {
    resumo.verificados++;
    const base: any = { ultimo_sync_em: new Date().toISOString(), tentativas_sync: (l.tentativas_sync ?? 0) + 1 };
    try {
      if (!l.gateway_link_id) throw new Error("Link sem gateway_link_id.");
      const { api, bearer } = await token(l.ambiente === "prod" ? "prod" : "hml");
      if (l.meio === "pix") {
        const rP = await fetch(`${api}/v2/charge/${encodeURIComponent(l.gateway_link_id)}`, {
          headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        });
        const cP = await lerCorpo(rP);
        base.resposta_ultimo_sync = cP;
        if (!rP.ok) throw new Error(`Consultar PIX: ${msgApi(cP, rP.status)}`);
        const p = lerPix(cP);
        if (p.pago) {
          const { data: atual } = await sb.from("pagamento_link").select("status").eq("id", l.id).maybeSingle();
          if (atual?.status === "pago") { resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "já pago" }); continue; }
          const ref = p.prova ?? p.transactionId;
          if (!ref) throw new Error("PIX pago sem transactionId/endToEndId — confirmar manualmente.");
          if (!l.provisao_id) throw new Error("Registro PIX sem provisão — confirmar manualmente.");
          const valorPago = p.valorCentavos != null ? p.valorCentavos / 100 : Number(l.valor);
          const { error: eRpc } = await sb.rpc("confirmar_pagamento_linha", {
            p_provisao_id: l.provisao_id,
            p_prova_tipo: "pix_txid",
            p_prova_ref: ref,
            p_data_pagamento: p.data,
            p_observacao: `PIX Safrapay · charge ${p.id ?? l.gateway_link_id} · nsu ${p.nsu ?? "—"}`,
          });
          if (eRpc) {
            const erro = `PIX pago na Safrapay, mas a confirmação falhou: ${eRpc.message}`;
            await sb.from("pagamento_link").update({ ...base, erro, charge_id: p.id ?? l.gateway_link_id, nsu: p.nsu, valor_pago: valorPago, pago_em: p.data }).eq("id", l.id);
            resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
            continue;
          }
          const { error: eUp } = await sb.from("pagamento_link").update({
            ...base, status: "pago", erro: null, charge_id: p.id ?? l.gateway_link_id, nsu: p.nsu, valor_pago: valorPago, pago_em: p.data,
          }).eq("id", l.id);
          if (eUp) throw new Error(`Gravar pagamento: ${eUp.message}`);
          resumo.pagos++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "PIX pago" });
        } else if (p.cancelado) {
          await sb.from("pagamento_link").update({ ...base, status: "cancelado" }).eq("id", l.id);
          resumo.cancelados++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "PIX cancelado/expirado" });
        } else {
          const { error } = await sb.from("pagamento_link").update(base).eq("id", l.id);
          if (error) throw new Error(`Gravar sync: ${error.message}`);
          resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "PIX aguardando pagamento" });
        }
        continue;
      }
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

      const pedidoPix = formaPedido.get(l.pedido_id) === "pix";
      if (paga && pedidoPix) {
        // Pedido PIX → link só com Pix: confirma a linha de portão com a prova PIX.
        const { data: atual } = await sb.from("pagamento_link").select("status").eq("id", l.id).maybeSingle();
        if (atual?.status === "pago") { resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "já pago" }); continue; }
        if (!l.provisao_id) throw new Error("Link PIX sem provisão de portão — confirmar manualmente.");
        const ref = paga.pixRef ?? paga.nsu;
        if (!ref) throw new Error("PIX pago no link sem endToEndId/transactionId — confirmar manualmente.");
        const valorPago = paga.valorCentavos != null ? paga.valorCentavos / 100 : Number(l.valor);
        const { error: eRpc } = await sb.rpc("confirmar_pagamento_linha", {
          p_provisao_id: l.provisao_id,
          p_prova_tipo: "pix_txid",
          p_prova_ref: ref,
          p_data_pagamento: paga.data,
          p_observacao: `PIX via link Safrapay · link ${l.gateway_link_id} · charge ${paga.id ?? "—"}`,
        });
        if (eRpc) {
          const erro = `PIX pago no link Safrapay, mas a confirmação falhou: ${eRpc.message}`;
          await sb.from("pagamento_link").update({ ...base, erro, charge_id: paga.id, nsu: ref, valor_pago: valorPago, pago_em: paga.data }).eq("id", l.id);
          resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
          continue;
        }
        const { error: eUp } = await sb.from("pagamento_link").update({
          ...base, status: "pago", erro: null, charge_id: paga.id, nsu: ref, valor_pago: valorPago, pago_em: paga.data,
        }).eq("id", l.id);
        if (eUp) throw new Error(`Gravar pagamento: ${eUp.message}`);
        resumo.pagos++; resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "PIX pago (link)" });
      } else if (paga && paga.ehPix) {
        const erro = "Pago via PIX no link — confirmar manualmente (fase de medição)";
        const valorPago = paga.valorCentavos != null ? paga.valorCentavos / 100 : Number(l.valor);
        const { error: eUp } = await sb.from("pagamento_link").update({
          ...base, erro, charge_id: paga.id, nsu: paga.pixRef, valor_pago: valorPago, pago_em: paga.data,
        }).eq("id", l.id);
        if (eUp) throw new Error(`Gravar PIX no link: ${eUp.message}`);
        resumo.erros++; resumo.detalhes.push({ pedido_id: l.pedido_id, erro });
      } else if (paga) {
        if (!paga.nsu) throw new Error("Pagamento aprovado sem transactionId (NSU) — confirmar manualmente.");
        const valorPago = paga.valorCentavos != null ? paga.valorCentavos / 100 : Number(l.valor);
        const { data: atual } = await sb.from("pagamento_link").select("status").eq("id", l.id).maybeSingle();
        if (atual?.status === "pago") { resumo.detalhes.push({ pedido_id: l.pedido_id, resultado: "já pago" }); continue; }
        const { error: eRpc } = await sb.rpc("confirmar_cartao_capturado", {
          p_pedido_id: l.pedido_id,
          p_nsu: paga.nsu,
          p_data_captura: paga.data,
          p_valor_capturado: valorPago,
          p_observacao: `Safrapay link ${l.gateway_link_id} · charge ${paga.id} · aut ${paga.aut ?? "—"} · ${paga.bandeira ?? "—"} ****${paga.final ?? "—"} · ${paga.parcelas ?? "—"}x`,
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
