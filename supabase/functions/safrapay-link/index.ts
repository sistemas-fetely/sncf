// Safrapay Link de Pagamento (cartão) para a Venda Direta.
// Cria (ou devolve o vigente) link de pagamento de um pedido. Usuário autenticado.
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
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return { texto: t.slice(0, 2000) };
  }
}

function msgApi(corpo: any, status: number): string {
  const m =
    corpo?.errors?.map?.((e: any) => e?.message ?? e?.description ?? JSON.stringify(e)).join("; ") ||
    corpo?.message || corpo?.error || corpo?.title || corpo?.texto;
  return `Safrapay HTTP ${status}${m ? `: ${typeof m === "string" ? m : JSON.stringify(m)}` : ""}`;
}

function montarCustomer(parceiro: any, pedido: any, avisos: string[]) {
  const nome = txt(parceiro?.razao_social) ?? txt(parceiro?.nome_fantasia) ?? txt(pedido?.cliente_nome_snapshot);
  const cpf = dig(parceiro?.cpf);
  if (!nome || (cpf.length !== 11 && cpf.length !== 14)) {
    avisos.push("Cliente sem nome ou CPF/CNPJ válido — link criado sem dados do comprador.");
    return undefined;
  }
  const c: any = { name: nome, document: cpf, documentType: cpf.length === 14 ? 2 : 1 } // 1 = CPF, 2 = CNPJ;
  const email = txt(parceiro?.email);
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) c.email = email;
  let tel = dig(parceiro?.telefone);
  if (tel.startsWith("55") && tel.length >= 12) tel = tel.slice(2);
  if (tel.length === 10 || tel.length === 11) {
    c.phone = { countryCode: "55", areaCode: tel.slice(0, 2), number: tel.slice(2), type: 1 };
  }
  const ee = pedido?.endereco_entrega && typeof pedido.endereco_entrega === "object" ? pedido.endereco_entrega : null;
  const src = ee && dig(ee.cep).length === 8
    ? {
        street: ee.logradouro ?? ee.rua ?? ee.endereco, number: ee.numero, neighborhood: ee.bairro,
        city: ee.cidade ?? ee.municipio, state: ee.uf ?? ee.estado, zip: ee.cep, complement: ee.complemento,
      }
    : {
        street: parceiro?.logradouro, number: parceiro?.numero, neighborhood: parceiro?.bairro,
        city: parceiro?.cidade, state: parceiro?.uf, zip: parceiro?.cep, complement: parceiro?.endereco_complemento,
      };
  const zip = dig(src.zip);
  if (txt(src.street) && txt(src.number) && txt(src.neighborhood) && txt(src.city) && txt(src.state) && zip.length === 8) {
    c.address = {
      street: txt(src.street), number: txt(src.number), neighborhood: txt(src.neighborhood),
      city: txt(src.city), state: String(src.state).trim().toUpperCase().slice(0, 2), country: "BR", zipCode: zip,
      ...(txt(src.complement) ? { complement: txt(src.complement) } : {}),
    };
  }
  return c;
}

/** Lê supportedPaymentTypes (strings, ou objetos por compatibilidade) e diz se "Credit" está disponível. */
function temCredito(corpo: any): boolean {
  const lista: any[] = corpo?.supportedPaymentTypes ?? corpo?.data?.supportedPaymentTypes ?? corpo?.paymentTypes ?? (Array.isArray(corpo) ? corpo : []);
  if (!Array.isArray(lista)) return false;
  return lista.some((t) => {
    const v = typeof t === "string" ? t : (t?.name ?? t?.type ?? t?.value ?? t?.code ?? "");
    return String(v).trim().toLowerCase() === "credit";
  });
}

/** DELETE no Safra falhou só porque o link já não é pagável (expirado/cancelado/pago)? */
function deleteToleravel(status: number, corpo: any): boolean {
  if (status === 404 || status === 410) return true;
  const m = JSON.stringify(corpo ?? "").toLowerCase();
  return /expir|cancel|paid|pago|already|j[aá] /.test(m);
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
  if (!permitido) return json({ ok: false, erro: "Sem permissão para gerar link de cartão da Venda Direta." }, 403);

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
  const portal = String(cfg[`url_portal_${amb}`] ?? "").replace(/\/+$/, "");
  const segredo = cfg[`segredo_token_${amb}`];
  if (!apiBase || !portal || !segredo) return json({ ok: false, erro: `Configuração Safrapay incompleta para ${amb}.` }, 500);
  const merchantId = String(cfg[`merchant_id_${amb}`] ?? "").trim();

  const { data: pedido, error: eP } = await sb
    .from("pedidos")
    .select("id, id_externo, parceiro_id, valor_liquido, forma_solicitada, origem, estagio, cancelado_em, endereco_entrega, cliente_nome_snapshot")
    .eq("id", pedidoId).maybeSingle();
  if (eP) return json({ ok: false, erro: `Ler pedido: ${eP.message}` }, 500);
  if (!pedido) return json({ ok: false, erro: "Pedido não encontrado." }, 404);
  if (pedido.origem !== "venda_direta") return json({ ok: false, erro: "Pedido não é da Venda Direta." }, 409);
  if (pedido.forma_solicitada !== "cartao_credito") return json({ ok: false, erro: "Pedido não é de cartão de crédito." }, 409);
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

  // Link vigente?
  const { data: vig, error: eV } = await sb
    .from("pagamento_link").select("*")
    .eq("pedido_id", pedidoId).in("status", ["criando", "aberto"]);
  if (eV) return json({ ok: false, erro: `Ler links: ${eV.message}` }, 500);
  const agora = Date.now();
  const cancelarNoSafra: { id: string; gateway_link_id: string; novoStatus: string }[] = [];
  for (const l of vig ?? []) {
    const valido = l.status === "aberto" && l.expira_em && new Date(l.expira_em).getTime() > agora;
    if (valido && !forcarNovo) {
      return json({ ok: true, url: l.url, expira_em: l.expira_em, max_parcelas: l.max_parcelas, pagamento_link_id: l.id, reaproveitado: true });
    }
    if (l.status === "criando" && !forcarNovo && new Date(l.criado_em).getTime() > agora - 2 * 60_000) {
      return json({ ok: false, erro: "Já há um link sendo criado para este pedido. Tente em instantes." }, 409);
    }
    const novoStatus = valido || l.status === "criando" ? "cancelado" : "expirado";
    if (l.status === "aberto" && l.gateway_link_id) {
      cancelarNoSafra.push({ id: l.id, gateway_link_id: String(l.gateway_link_id), novoStatus });
      continue;
    }
    const { error } = await sb.from("pagamento_link").update({ status: novoStatus }).eq("id", l.id);
    if (error) return json({ ok: false, erro: `Encerrar link anterior: ${error.message}` }, 500);
  }

  const expira = new Date(agora + Number(cfg.validade_horas ?? 24) * 3600_000);
  const { data: linha, error: eIns } = await sb.from("pagamento_link").insert({
    criado_por: userId, pedido_id: pedidoId, provisao_id: prov.id, gateway: "safrapay", ambiente: amb,
    valor, max_parcelas: cfg.max_parcelas, expira_em: expira.toISOString(), status: "criando",
  }).select("id").single();
  if (eIns) return json({ ok: false, erro: `Registrar link: ${eIns.message}` }, 409);

  const falhar = async (erro: string, status = 502) => {
    await sb.from("pagamento_link").update({ status: "erro", erro }).eq("id", linha.id);
    console.error("[safrapay-link] erro", { pedido_id: pedidoId, erro });
    return json({ ok: false, erro, pagamento_link_id: linha.id }, status);
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
    const rT = await fetch(`${apiBase}/v2/paymentlink/paymentTypes`, { headers: h });
    const cT = await lerCorpo(rT);
    if (!rT.ok) return await falhar(`Consultar tipos de pagamento: ${msgApi(cT, rT.status)}`);
    if (!temCredito(cT)) return await falhar("Tipo Credit não disponível para este estabelecimento");
    const tipos = ["Credit"];

    // Cancelar no Safra o(s) link(s) anterior(es) antes de criar o novo — nunca dois links pagáveis.
    if (cancelarNoSafra.length) {
      if (!merchantId) return await falhar(`merchant_id_${amb} ausente em safrapay_config — não dá para cancelar o link anterior.`, 500);
      for (const ant of cancelarNoSafra) {
        const rD = await fetch(`${apiBase}/v2/smartcheckout/${encodeURIComponent(ant.gateway_link_id)}`, {
          method: "DELETE", headers: { Authorization: `Bearer ${accessToken}`, MerchantId: merchantId },
        });
        const cD = await lerCorpo(rD);
        let statusAnt = "cancelado";
        if (!rD.ok) {
          if (!deleteToleravel(rD.status, cD)) {
            return await falhar(`Cancelar link anterior no Safra (${ant.gateway_link_id}): ${msgApi(cD, rD.status)}`);
          }
          statusAnt = ant.novoStatus;
          avisos.push(`Link anterior ${ant.gateway_link_id} já não estava ativo no Safra.`);
        }
        const { error } = await sb.from("pagamento_link").update({ status: statusAnt }).eq("id", ant.id);
        if (error) return await falhar(`Encerrar link anterior: ${error.message}`, 500);
      }
    }

    let parceiro: any = null;
    if (pedido.parceiro_id) {
      const { data: pc, error: ePc } = await sb.from("parceiros_comerciais")
        .select("razao_social, nome_fantasia, cpf, email, telefone, cep, logradouro, numero, bairro, cidade, uf, endereco_complemento")
        .eq("id", pedido.parceiro_id).maybeSingle();
      if (ePc) return await falhar(`Ler cliente: ${ePc.message}`, 500);
      parceiro = pc;
    }
    const customer = montarCustomer(parceiro, pedido, avisos);

    const payload: any = {
      amount,
      description: `Fetely · ${pedido.id_externo}`,
      orderCode: pedido.id_externo,
      expiration: expira.toISOString(),
      maxInstallmentNumber: cfg.max_parcelas,
      ...(customer ? { customer } : {}),
      paymentSupportedTypes: tipos,
    };
    const rL = await fetch(`${apiBase}/v2/paymentlink`, { method: "POST", headers: h, body: JSON.stringify(payload) });
    const cL = await lerCorpo(rL);
    const d = cL?.data ?? cL;
    const linkId = d?.id ?? d?.paymentLinkId;
    const rel = d?.smartCheckoutUrl;
    if (!rL.ok || !linkId || !rel) return await falhar(`Criar link: ${msgApi(cL, rL.status)}`);
    const urlFinal = /^https?:\/\//.test(String(rel)) ? String(rel) : `${portal}${String(rel).startsWith("/") ? "" : "/"}${rel}`;
    const expiraFinal = d?.expiration ? new Date(d.expiration).toISOString() : expira.toISOString();

    const { error: eUp } = await sb.from("pagamento_link").update({
      status: "aberto", gateway_link_id: String(linkId), url: urlFinal, expira_em: expiraFinal,
      max_parcelas: cfg.max_parcelas, erro: null,
      resposta_criacao: { id: linkId, smartCheckoutUrl: rel, expiration: d?.expiration ?? null, status: d?.status ?? null, paymentSupportedTypes: tipos, avisos },
    }).eq("id", linha.id);
    if (eUp) return json({ ok: false, erro: `Link criado na Safrapay mas não gravado: ${eUp.message}` }, 500);

    return json({ ok: true, url: urlFinal, expira_em: expiraFinal, max_parcelas: cfg.max_parcelas, pagamento_link_id: linha.id, avisos });
  } catch (e) {
    return await falhar(e instanceof Error ? e.message : String(e));
  }
});
