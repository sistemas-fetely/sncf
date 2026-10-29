// ETIQUETA-CORREIOS-SNCF (29/10/2026, Flávio): o SNCF gera a pré-postagem Correios dos pedidos
// expedidos em SP e imprime o rótulo na Mesa. Ações: criar | rotulo | cancelar.
// Token por CARTÃO (correios_cartao_postagem), cache em correios_token id `cartao_<numero>`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const AMBIENTE = (Deno.env.get("CORREIOS_AMBIENTE") ?? "PRODUCAO").toUpperCase();
const BASE = AMBIENTE === "HOMOLOGACAO" ? "https://apihom.correios.com.br" : "https://api.correios.com.br";
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPA_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

class Falha extends Error {
  constructor(public status: number, msg: string, public detalhe?: unknown) { super(msg); }
}
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

type Cartao = { cartao: string; contrato: string; dr: number };

async function token(c: Cartao): Promise<string> {
  const id = `cartao_${c.cartao}`;
  const { data: cache } = await admin.from("correios_token").select("token, expira_em").eq("id", id).maybeSingle();
  if (cache && new Date(cache.expira_em).getTime() - 5 * 60_000 > Date.now()) return cache.token;
  const basic = btoa(`${Deno.env.get("CORREIOS_ID")}:${Deno.env.get("CORREIOS_SENHA_API")}`);
  const r = await fetch(`${BASE}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ numero: c.cartao, contrato: c.contrato, dr: c.dr }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Falha(502, `Correios recusou o token do cartão ${c.cartao} (HTTP ${r.status}): ${txt}`);
  const j = JSON.parse(txt);
  const { error } = await admin.from("correios_token").upsert({
    id, token: j.token, expira_em: j.expiraEm, ambiente: AMBIENTE, atualizado_em: new Date().toISOString(),
  });
  if (error) console.warn("cache token falhou", error.message);
  return j.token;
}

async function api(c: Cartao, metodo: string, caminho: string, body?: unknown) {
  const t = await token(c);
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${t}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let corpo: unknown = txt;
  try { corpo = txt ? JSON.parse(txt) : null; } catch { /* texto */ }
  return { ok: r.ok, status: r.status, corpo };
}

async function cartaoPorNumero(numero: string): Promise<Cartao> {
  const { data, error } = await admin.from("correios_cartao_postagem").select("cartao, contrato, dr").eq("cartao", numero).maybeSingle();
  if (error) throw new Falha(500, `ler cartão: ${error.message}`);
  if (!data) throw new Falha(400, `Cartão ${numero} não cadastrado em correios_cartao_postagem.`);
  return data as Cartao;
}

async function criar(pedidoId: string, uid: string) {
  const { data: viva } = await admin.from("correios_prepostagem").select("*").eq("pedido_id", pedidoId).neq("status", "cancelada").maybeSingle();
  if (viva) return { ok: true, existente: true, prepostagem: viva };

  const { data: ped, error: ePed } = await admin.from("pedidos").select("id, id_externo, origem_centro_id").eq("id", pedidoId).maybeSingle();
  if (ePed) throw new Falha(500, `ler pedido: ${ePed.message}`);
  if (!ped) throw new Falha(404, "Pedido não encontrado.");
  const { data: cd } = await admin.from("centro_distribuicao").select("id, codigo, centro_fiscal_id, cnpj_emitente").eq("id", ped.origem_centro_id).maybeSingle();
  if (!cd) throw new Falha(400, `${ped.id_externo}: pedido sem CD de expedição.`);
  const estab = cd.centro_fiscal_id ?? cd.id;
  const { data: cartao } = await admin.from("correios_cartao_postagem").select("cartao, contrato, dr").eq("centro_id", estab).eq("ativo", true).maybeSingle();
  if (!cartao) throw new Falha(400, `Nenhum cartão de postagem Correios ligado ao estabelecimento do CD ${cd.codigo}. Cadastre em correios_cartao_postagem.centro_id.`);
  const { data: estabRow } = await admin.from("centro_distribuicao").select("cnpj_emitente, bairro").eq("id", estab).maybeSingle();

  const { data: dados, error: eD } = await admin.rpc("fn_mesa_sp_dados_impressao", { p_pedido_id: pedidoId });
  if (eD) throw new Falha(500, `fn_mesa_sp_dados_impressao: ${eD.message}`);
  const d = dados as any;
  const servico = d?.servico_correios as string | null;
  if (!servico) throw new Falha(400, `${ped.id_externo}: serviço Correios (PAC/SEDEX) ausente no pedido.`);
  const { data: sv } = await admin.from("correios_servico_codigo").select("codigo_servico").eq("servico", servico).eq("ativo", true).maybeSingle();
  if (!sv) throw new Falha(400, `Serviço ${servico} sem código em correios_servico_codigo.`);

  const { data: emb } = await admin.from("pedido_eventos").select("metadata").eq("pedido_id", pedidoId).eq("tipo_evento", "mesa_embalado")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const m = (emb?.metadata ?? {}) as any;
  if (!emb) throw new Falha(400, `${ped.id_externo}: sem embalagem registrada.`);
  if (Number(m.volumes ?? 1) > 1) throw new Falha(400, `${ped.id_externo}: ${m.volumes} volumes — pré-postagem do SNCF ainda só gera 1 volume por pedido. Use "Postar na agência".`);
  const pesoG = Math.round(Number(m.peso_kg ?? 0) * 1000);
  if (!(pesoG > 0)) throw new Falha(400, `${ped.id_externo}: peso da embalagem ausente.`);
  const { data: cx } = await admin.from("b2c_embalagem_caixa").select("codigo, comprimento_cm, largura_cm, altura_cm").eq("codigo", m.caixa ?? "").maybeSingle();
  if (!cx) throw new Falha(400, `${ped.id_externo}: caixa "${m.caixa ?? "?"}" da embalagem não encontrada no cadastro.`);

  const { data: nf } = await admin.from("nfs_emitidas").select("numero, chave_acesso").eq("pedido_venda_id", pedidoId).eq("situacao", "autorizada")
    .order("autorizada_em", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  const chave = dig(nf?.chave_acesso);
  if (!nf || chave.length !== 44) throw new Falha(400, `${ped.id_externo}: NF-e autorizada com chave de acesso é obrigatória para a pré-postagem.`);

  const rem = d.remetente ?? {}, dest = d.destinatario ?? {};
  const endereco = (e: any) => ({
    cep: dig(e.cep), logradouro: e.logradouro ?? "", numero: e.numero ?? "S/N",
    complemento: e.complemento ?? "", bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "",
  });
  const payload = {
    remetente: { nome: rem.nome, cpfCnpj: dig(estabRow?.cnpj_emitente ?? cd.cnpj_emitente), endereco: endereco({ ...rem, bairro: rem.bairro ?? estabRow?.bairro }) },
    destinatario: { nome: dest.nome, endereco: endereco(dest) },
    codigoServico: sv.codigo_servico,
    numeroNotaFiscal: String(nf.numero),
    chaveNFe: chave,
    pesoInformado: String(pesoG),
    codigoFormatoObjetoInformado: "2",
    alturaInformada: String(Math.ceil(Number(cx.altura_cm))),
    larguraInformada: String(Math.ceil(Number(cx.largura_cm))),
    comprimentoInformado: String(Math.ceil(Number(cx.comprimento_cm))),
    cienteObjetoNaoProibido: 1,
    numeroCartaoPostagem: cartao.cartao,
    observacao: `${ped.id_externo}`,
  };
  const r = await api(cartao as Cartao, "POST", "/prepostagem/v1/prepostagens", payload);
  if (!r.ok) throw new Falha(502, `Correios recusou a pré-postagem (HTTP ${r.status}): ${typeof r.corpo === "string" ? r.corpo : JSON.stringify(r.corpo)}`, { payload });
  const c = r.corpo as any;
  const { data: pp, error: eI } = await admin.from("correios_prepostagem").insert({
    pedido_id: pedidoId, cartao: cartao.cartao, id_prepostagem_correios: c.id, codigo_objeto: c.codigoObjeto,
    codigo_servico: sv.codigo_servico, servico, peso_g: pesoG, altura_cm: cx.altura_cm, largura_cm: cx.largura_cm,
    comprimento_cm: cx.comprimento_cm, caixa_codigo: cx.codigo, chave_nfe: chave, status: "criada",
    payload_envio: payload, resposta: c, criado_por: uid,
  }).select().single();
  if (eI) throw new Falha(500, `Pré-postagem ${c.codigoObjeto} criada nos Correios mas não gravada: ${eI.message}`);
  const { error: eV } = await admin.rpc("fn_correios_prepostagem_vincular", { p_prepostagem_id: pp.id, p_auth_uid: uid });
  if (eV) throw new Falha(500, `Pré-postagem ${c.codigoObjeto} gravada mas não vinculada ao pedido: ${eV.message}`);
  return { ok: true, existente: false, prepostagem: pp };
}

async function rotulo(prepostagemId: string) {
  const { data: pp } = await admin.from("correios_prepostagem").select("*").eq("id", prepostagemId).maybeSingle();
  if (!pp || pp.status === "cancelada") throw new Falha(404, "Pré-postagem não encontrada ou cancelada.");
  const cartao = await cartaoPorNumero(pp.cartao);
  const s = await api(cartao, "POST", "/prepostagem/v1/prepostagens/rotulo/assincrono/pdf", {
    idsPrePostagem: [pp.id_prepostagem_correios], tipoRotulo: "P", formatoRotulo: "ET", imprimeRemetente: "S", layoutImpressao: "PADRAO",
  });
  if (!s.ok) throw new Falha(502, `Correios recusou o rótulo (HTTP ${s.status}): ${JSON.stringify(s.corpo)}`);
  const recibo = (s.corpo as any)?.idRecibo;
  if (!recibo) throw new Falha(502, `Correios não devolveu idRecibo do rótulo: ${JSON.stringify(s.corpo)}`);
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1500));
    const g = await api(cartao, "GET", `/prepostagem/v1/prepostagens/rotulo/download/assincrono/${recibo}`);
    const dados = (g.corpo as any)?.dados;
    if (g.ok && dados) {
      await admin.from("correios_prepostagem").update({ status: "rotulo_impresso" }).eq("id", pp.id).eq("status", "criada");
      return { ok: true, pdf_base64: dados, codigo_objeto: pp.codigo_objeto };
    }
  }
  throw new Falha(504, `Rótulo do ${pp.codigo_objeto} ainda não ficou pronto nos Correios (recibo ${recibo}). Tente reimprimir.`);
}

async function cancelar(arg: { prepostagem_id?: string; codigo_objeto?: string; pedido_id?: string; motivo?: string }, uid: string) {
  const motivo = (arg.motivo ?? "").trim();
  if (motivo.length < 3) throw new Falha(400, "Informe o motivo do cancelamento.");
  let q = admin.from("correios_prepostagem").select("*").neq("status", "cancelada");
  if (arg.prepostagem_id) q = q.eq("id", arg.prepostagem_id);
  else if (arg.codigo_objeto) q = q.eq("codigo_objeto", arg.codigo_objeto.toUpperCase());
  else if (arg.pedido_id) q = q.eq("pedido_id", arg.pedido_id);
  else throw new Falha(400, "Informe prepostagem_id, codigo_objeto ou pedido_id.");
  const { data: pp } = await q.maybeSingle();
  if (!pp && arg.pedido_id && !arg.codigo_objeto) return { ok: true, nada_a_cancelar: true };
  const codigo = (pp?.codigo_objeto ?? arg.codigo_objeto ?? "").toUpperCase();
  if (!codigo) throw new Falha(404, "Pré-postagem não encontrada.");

  // Código do Bling (sem linha aqui): tenta cada cartão ativo até um aceitar.
  const cartoes: Cartao[] = pp
    ? [await cartaoPorNumero(pp.cartao)]
    : ((await admin.from("correios_cartao_postagem").select("cartao, contrato, dr").eq("ativo", true)).data ?? []) as Cartao[];
  const tentativas: unknown[] = [];
  for (const c of cartoes) {
    const r = await api(c, "DELETE", `/prepostagem/v1/prepostagens/objeto/${codigo}`);
    tentativas.push({ cartao: c.cartao, status: r.status, corpo: r.corpo });
    if (r.ok) {
      if (pp) {
        const { error } = await admin.rpc("fn_correios_prepostagem_desvincular", { p_prepostagem_id: pp.id, p_motivo: motivo, p_auth_uid: uid });
        if (error) throw new Falha(500, `Cancelado nos Correios, mas não desvinculado do pedido: ${error.message}`);
      }
      return { ok: true, codigo_objeto: codigo, cartao: c.cartao, resposta: r.corpo };
    }
  }
  throw new Falha(502, `Correios não cancelou ${codigo}.`, tentativas);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ erro: "Não autorizado" }, 401);
    const userClient = createClient(SUPA_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: cl, error: eC } = await userClient.auth.getClaims(auth.slice(7));
    if (eC || !cl?.claims?.sub) return json({ erro: "Não autorizado" }, 401);
    const uid = cl.claims.sub as string;
    const { data: pode, error: eP } = await admin.rpc("usuario_tem_acao", { p_slug: "acao.expedicao_sp_operar", p_user_id: uid });
    if (eP) throw new Falha(500, `checar permissão: ${eP.message}`);
    if (!pode) return json({ erro: "Sem permissão para esta ação (acao.expedicao_sp_operar)." }, 403);

    const body = await req.json().catch(() => ({}));
    const acao = body?.acao;
    if (acao === "criar") {
      if (!body.pedido_id) throw new Falha(400, "pedido_id obrigatório.");
      return json(await criar(body.pedido_id, uid));
    }
    if (acao === "rotulo") {
      if (!body.prepostagem_id) throw new Falha(400, "prepostagem_id obrigatório.");
      return json(await rotulo(body.prepostagem_id));
    }
    if (acao === "cancelar") return json(await cancelar(body, uid));
    throw new Falha(400, "acao deve ser criar, rotulo ou cancelar.");
  } catch (e) {
    const f = e instanceof Falha ? e : new Falha(500, (e as Error).message);
    console.error("[correios-prepostagem]", f.message, f.detalhe ?? "");
    return json({ erro: f.message, detalhe: f.detalhe ?? null }, f.status);
  }
});
