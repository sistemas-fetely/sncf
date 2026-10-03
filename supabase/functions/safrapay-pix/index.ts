// Safrapay PIX (cobrança com QR dinâmico) para a Venda Direta.
// Cria (ou devolve a vigente) cobrança PIX de um pedido. Usuário autenticado.
// NUNCA loga nem devolve o MerchantToken ou o accessToken.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const txt = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

async function lerCorpo(r: Response): Promise<any> {
  const t = await r.text();
  try { return t ? JSON.parse(t) : null; } catch { return { texto: t.slice(0, 2000) }; }
}

function msgApi(corpo: any, status: number): string {
  const m =
    corpo?.errors?.map?.((e: any) => e?.message ?? e?.description ?? JSON.stringify(e)).join("; ") ||
    corpo?.message || corpo?.error || corpo?.title || corpo?.texto;
  return `Safrapay HTTP ${status}${m ? `: ${typeof m === "string" ? m : JSON.stringify(m)}` : ""}`;
}

/** Customer só vai completo: nome + CPF/CNPJ + e-mail válido + telefone completo. Senão, omite. */
function montarCustomer(parceiro: any, pedido: any, avisos: string[]) {
  const nome = txt(parceiro?.razao_social) ?? txt(parceiro?.nome_fantasia) ?? txt(pedido?.cliente_nome_snapshot);
  const doc = dig(parceiro?.cpf);
  const email = txt(parceiro?.email);
  let tel = dig(parceiro?.telefone);
  if (tel.startsWith("55") && tel.length >= 12) tel = tel.slice(2);
  const emailOk = !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!nome || (doc.length !== 11 && doc.length !== 14) || !emailOk || (tel.length !== 10 && tel.length !== 11)) {
    avisos.push("Cliente sem nome, CPF/CNPJ, e-mail ou telefone completos — cobrança criada sem dados do comprador.");
    return undefined;
  }
  return {
    name: nome, document: doc, documentType: doc.length === 14 ? 2 : 1, email,
    phone: { countryCode: "55", areaCode: tel.slice(0, 2), number: tel.slice(2), type: 1 },
  };
}

/** DELETE falhou só porque a cobrança já não é pagável? */
function deleteToleravel(status: number, corpo: any): boolean {
  if (status === 404 || status === 410) return true;
  const m = JSON.stringify(corpo ?? "").toLowerCase();
  return /expir|cancel|already|j[aá] /.test(m);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado: token ausente." }, 401);
  const { data: u, error: eU } = await sb.auth.getUser(auth.slice(7).trim());
  if (eU || !u?.user) return json({ ok: false, erro: "Não autorizado: sessão inválida." }, 401);
  const userId = u.user.id;

  const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  let permitido = false;
  for (const slug of ["tela.venda_direta_novo", "tela.venda_direta_gestao"]) {
    const { data, error } = await sbUser.rpc("tem_permissao", { p_slug: slug });
    if (error) return json({ ok: false, erro: `Falha ao avaliar permissão ${slug}: ${error.message}` }, 500);
    if (data === true) { permitido = true; break; }
  }
  if (!permitido) return json({ ok: false, erro: "Sem permissão para gerar PIX da Venda Direta." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, erro: "Corpo JSON inválido." }, 400); }
  const pedidoId = String(body?.pedido_id ?? "");
  const forcarNovo = body?.forcar_novo === true;
  if (!/^[0-9a-f-]{36}$/i.test(pedidoId)) return json({ ok: false, erro: "pedido_id inválido." }, 400);

  const { data: cfg, error: eCfg } = await sb.from("safrapay_config").select("*").eq("id", 1).maybeSingle();
  if (eCfg) return json({ ok: false, erro: `Ler configuração Safrapay: ${eCfg.message}` }, 500);
  if (!cfg) return json({ ok: false, erro: "Configuração Safrapay ausente." }, 500);
  if (!cfg.ativo) return json({ ok: false, erro: "Integração Safrapay aguardando ativação (MerchantToken)." }, 409);
  const amb = cfg.ambiente === "prod" ? "prod" : "hml";
  const apiBase = String(cfg[`url_api_${amb}`] ?? "").replace(/\/+$/, "");
  const segredo = cfg[`segredo_token_${amb}`];
  if (!apiBase || !segredo) return json({ ok: false, erro: `Configuração Safrapay incompleta para ${amb}.` }, 500);
  const merchantId = String(cfg[`merchant_id_${amb}`] ?? "").trim();

  const { data: pedido, error: eP } = await sb
    .from("pedidos")
    .select("id, id_externo, parceiro_id, valor_liquido, forma_solicitada, origem, estagio, cancelado_em, cliente_nome_snapshot")
    .eq("id", pedidoId).maybeSingle();
  if (eP) return json({ ok: false, erro: `Ler pedido: ${eP.message}` }, 500);
  if (!pedido) return json({ ok: false, erro: "Pedido não encontrado." }, 404);
  if (pedido.origem !== "venda_direta") return json({ ok: false, erro: "Pedido não é da Venda Direta." }, 409);
  if (pedido.forma_solicitada !== "pix") return json({ ok: false, erro: "Pedido não é de PIX." }, 409);
  if (pedido.cancelado_em) return json({ ok: false, erro: "Pedido cancelado." }, 409);
  if (pedido.estagio !== "aguardando_pagamento") return json({ ok: false, erro: `Pedido não está aguardando pagamento (estágio ${pedido.estagio}).` }, 409);
  const valor = Number(pedido.valor_liquido ?? 0);
  const amount = Math.round(valor * 100);
  if (!(amount > 0)) return json({ ok: false, erro: "Pedido sem valor a cobrar." }, 409);

  const { data: provs, error: ePv } = await sb
    .from("provisao_recebimento").select("id, status, pago_em")
    .eq("pedido_id", pedidoId).eq("eh_portao", true).is("pago_em", null);
  if (ePv) return json({ ok: false, erro: `Ler provisão: ${ePv.message}` }, 500);
  const prov = (provs ?? []).find((p: any) => !["pago", "cancelado", "cancelada"].includes(String(p.status)));
  if (!prov) return json({ ok: false, erro: "Pedido sem provisão de portão em aberto." }, 409);

  // Registros vigentes (o índice vale para qualquer meio: 1 criando/aberto por pedido).
  const { data: vig, error: eV } = await sb
    .from("pagamento_link").select("*")
    .eq("pedido_id", pedidoId).in("status", ["criando", "aberto"]);
  if (eV) return json({ ok: false, erro: `Ler links: ${eV.message}` }, 500);
  const agora = Date.now();
  const cancelarNoSafra: { id: string; gateway_link_id: string; meio: string }[] = [];
  for (const l of vig ?? []) {
    if (l.meio === "pix" && l.status === "aberto" && l.pix_copia_cola && !forcarNovo) {
      return json({ ok: true, pix_copia_cola: l.pix_copia_cola, pagamento_link_id: l.id, reaproveitado: true });
    }
    if (l.status === "criando" && !forcarNovo && new Date(l.criado_em).getTime() > agora - 2 * 60_000) {
      return json({ ok: false, erro: "Já há uma cobrança sendo criada para este pedido. Tente em instantes." }, 409);
    }
    if (l.status === "aberto" && l.gateway_link_id) {
      cancelarNoSafra.push({ id: l.id, gateway_link_id: String(l.gateway_link_id), meio: String(l.meio ?? "cartao_link") });
      continue;
    }
    const { error } = await sb.from("pagamento_link").update({ status: "cancelado" }).eq("id", l.id);
    if (error) return json({ ok: false, erro: `Encerrar registro anterior: ${error.message}` }, 500);
  }

  let linha: { id: string } | null = null; // só existe depois de encerrar os anteriores
  const falhar = async (erro: string, status = 502) => {
    if (linha) await sb.from("pagamento_link").update({ status: "erro", erro }).eq("id", linha.id);
    console.error("[safrapay-pix] erro", { pedido_id: pedidoId, erro });
    return json(linha ? { ok: false, erro, pagamento_link_id: linha.id } : { ok: false, erro }, status);
  };

  try {
    const { data: merchantToken, error: eTok } = await sb.rpc("get_vault_secret", { p_name: segredo });
    if (eTok || !merchantToken) return await falhar(`MerchantToken indisponível (${segredo}).`, 500);
    const rAuth = await fetch(`${apiBase}/v2/merchant/auth`, {
      method: "POST", headers: { Authorization: String(merchantToken), "Content-Type": "application/json" },
    });
    const cAuth = await lerCorpo(rAuth);
    const accessToken = cAuth?.accessToken ?? cAuth?.data?.accessToken;
    if (!rAuth.ok || !accessToken) return await falhar(`Autenticação: ${msgApi(cAuth, rAuth.status)}`);
    const h = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const avisos: string[] = [];

    // Encerrar no Safra o(s) anterior(es) ANTES de gravar o novo.
    if (cancelarNoSafra.length) {
      if (!merchantId) return await falhar(`merchant_id_${amb} ausente em safrapay_config — não dá para cancelar a cobrança anterior.`, 500);
      for (const ant of cancelarNoSafra) {
        const caminho = ant.meio === "pix" ? `/v2/charge/${encodeURIComponent(ant.gateway_link_id)}` : `/v2/smartcheckout/${encodeURIComponent(ant.gateway_link_id)}`;
        const rD = await fetch(`${apiBase}${caminho}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}`, MerchantId: merchantId },
        });
        const cD = await lerCorpo(rD);
        if (!rD.ok) {
          if (!deleteToleravel(rD.status, cD)) {
            return await falhar(`Cancelar cobrança anterior no Safra (${ant.gateway_link_id}): ${msgApi(cD, rD.status)}`);
          }
          avisos.push(`Cobrança anterior ${ant.gateway_link_id} já não estava ativa no Safra.`);
        }
        const { error } = await sb.from("pagamento_link").update({ status: "cancelado" }).eq("id", ant.id);
        if (error) return await falhar(`Encerrar registro anterior: ${error.message}`, 500);
      }
    }

    const { data: linhaNova, error: eIns } = await sb.from("pagamento_link").insert({
      criado_por: userId, pedido_id: pedidoId, provisao_id: prov.id, gateway: "safrapay", ambiente: amb,
      meio: "pix", valor, max_parcelas: null, url: null, status: "criando",
    }).select("id").single();
    if (eIns) return await falhar(`Registrar PIX: ${eIns.message}`, 409);
    linha = linhaNova;

    let parceiro: any = null;
    if (pedido.parceiro_id) {
      const { data: pc, error: ePc } = await sb.from("parceiros_comerciais")
        .select("razao_social, nome_fantasia, cpf, email, telefone").eq("id", pedido.parceiro_id).maybeSingle();
      if (ePc) return await falhar(`Ler cliente: ${ePc.message}`, 500);
      parceiro = pc;
    }
    const customer = montarCustomer(parceiro, pedido, avisos);

    const payload = {
      charge: {
        merchantChargeId: pedido.id_externo,
        ...(customer ? { customer } : {}),
        transactions: [{ amount }],
        source: 1,
      },
    };
    const rC = await fetch(`${apiBase}/v2/charge/pix`, { method: "POST", headers: h, body: JSON.stringify(payload) });
    const cC = await lerCorpo(rC);
    const ch = cC?.charge ?? cC?.data?.charge ?? cC?.data ?? cC;
    const tx = Array.isArray(ch?.transactions) ? ch.transactions[0] : null;
    const chargeId = ch?.id ?? ch?.chargeId;
    const qr = tx?.qrCode ?? tx?.emv ?? tx?.copyPaste;
    if (!rC.ok || !chargeId || !qr) return await falhar(`Criar PIX: ${msgApi(cC, rC.status)}`);

    const { error: eUp } = await sb.from("pagamento_link").update({
      status: "aberto", gateway_link_id: String(chargeId), charge_id: String(chargeId), pix_copia_cola: String(qr), erro: null,
      resposta_criacao: { ...(cC ?? {}), avisos },
    }).eq("id", linha!.id);
    if (eUp) return json({ ok: false, erro: `PIX criado na Safrapay mas não gravado: ${eUp.message}` }, 500);

    return json({ ok: true, pix_copia_cola: String(qr), pagamento_link_id: linha!.id, avisos });
  } catch (e) {
    return await falhar(e instanceof Error ? e.message : String(e));
  }
});
