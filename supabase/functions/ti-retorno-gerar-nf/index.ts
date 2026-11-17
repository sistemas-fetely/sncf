import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { CNPJ_MATRIZ, criarOuRecuperar, montarPayload } from "./gerar.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, erro: "Configuração interna incompleta" }, 500);
  const user = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: authError } = await user.auth.getClaims(auth.slice(7));
  if (authError || !claims?.claims?.sub) return json({ ok: false, erro: "Não autorizado" }, 401);
  let pedidoId: string;
  try {
    const body = await req.json();
    if (typeof body?.pedido_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.pedido_id)) return json({ ok: false, erro: "pedido_id inválido" }, 400);
    pedidoId = body.pedido_id;
  } catch { return json({ ok: false, erro: "Corpo JSON malformado" }, 400); }
  const db = createClient(url, service);
  const registrar = async (status: string, id: number | null = null, numero: string | null = null, erro: string | null = null) => {
    const { data, error } = await user.rpc("fn_ti_retorno_nf_registrar", { p_pedido_id: pedidoId, p_status: status, p_bling_id: id, p_numero: numero, p_erro: erro });
    if (error) throw error;
    if (data?.ok === false) throw new Error(data.erro ?? "Registro da NF recusado.");
  };
  let iniciado = false;
  try {
    const { data: ret, error } = await db.from("ti_retorno").select("*").eq("pedido_id", pedidoId).maybeSingle();
    if (error) throw error;
    if (!ret) return json({ ok: false, erro: "TI de retorno não encontrada." }, 404);
    if (!ret.recebido_em) return json({ ok: false, erro: "Receba e conte o retorno antes de gerar a NF." }, 409);
    const { data: remessa, error: rErr } = await db.from("pedidos").select("id_externo,transferencia_finalidade_id").eq("id", ret.remessa_pedido_id).single();
    if (rErr) throw rErr;
    const { data: nf, error: nErr } = await db.from("nfs_emitidas").select("chave_acesso,numero").eq("pedido_venda_id", ret.remessa_pedido_id).eq("tipo", "saida").eq("situacao", "autorizada").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (nErr) throw nErr;
    if (!nf?.chave_acesso || !nf.numero) return json({ ok: false, erro: "NF de remessa ainda não autorizada." }, 409);
    const vinhaDeErro = ret.nf_status === "erro";
    try { await registrar("gerando"); iniciado = true; } catch (e) { return json({ ok: false, erro: mensagem(e) }, 409); }
    const resultados = await Promise.all([
      db.from("pedidos").select("id_externo").eq("id", pedidoId).single(),
      db.from("transferencia_finalidade").select("natureza_nf_retorno_id").eq("id", remessa.transferencia_finalidade_id).single(),
      db.from("pedido_itens").select("sku,valor_unitario").eq("pedido_id", pedidoId),
      db.from("parceiros_comerciais").select("razao_social,inscricao_estadual,logradouro,numero,endereco_complemento,bairro,cep,cidade,uf").eq("cnpj", CNPJ_MATRIZ).eq("ativo", true).order("created_at").limit(1).maybeSingle(),
      db.from("centro_distribuicao").select("logradouro,numero,complemento,bairro,cep,cidade,uf").eq("codigo", "SITE-SP").maybeSingle(),
      db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
    ]);
    for (const r of resultados) if (r.error) throw r.error;
    const [pedido, finalidade, custos, matrizRes, siteRes, cfgRes] = resultados;
    const { data: natureza, error: natErr } = await db.from("naturezas_operacao").select("bling_natureza_id").eq("id", finalidade.data?.natureza_nf_retorno_id).single();
    if (natErr) throw natErr;
    if (!natureza?.bling_natureza_id) throw new Error("Natureza de retorno sem id no Bling.");
    const matriz = matrizRes.data, site = siteRes.data, cfg = cfgRes.data;
    if (!matriz) throw new Error("Cadastro da Fetely matriz não encontrado.");
    const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
    const ie = dig(matriz.inscricao_estadual);
    if (ie.length < 8 || /^0+$/.test(ie)) throw new Error("IE da Fetely matriz inválida no cadastro de parceiros.");
    const endereco = { endereco: matriz.logradouro || site?.logradouro, numero: matriz.numero || site?.numero, complemento: matriz.endereco_complemento || site?.complemento || "", bairro: matriz.bairro || site?.bairro, cep: dig(matriz.cep || site?.cep), municipio: matriz.cidade || site?.cidade, uf: matriz.uf || site?.uf, pais: "Brasil" };
    const faltas = (["endereco", "numero", "bairro", "cep", "municipio", "uf"] as const).filter((k) => !endereco[k]);
    if (faltas.length) throw new Error(`Endereço da Fetely matriz incompleto (${faltas.join(", ")}).`);
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    if (!Array.isArray(ret.contagem) || ret.contagem.some((i: { sku?: unknown; recebido?: unknown }) => typeof i?.sku !== "string" || typeof i.recebido !== "number" || !Number.isFinite(i.recebido) || i.recebido < 0)) throw new Error("Contagem do retorno inválida.");
    const contagem = ret.contagem as { sku: string; recebido: number }[];
    const { data: produtos, error: pErr } = await db.from("sncf_produtos").select("sku,codigo_externo,nome_operacional,nome_completo,ncm,origem_fisc").in("sku", contagem.filter((i) => i.recebido > 0).map((i) => i.sku));
    if (pErr) throw pErr;
    const codigo = pedido.data?.id_externo;
    if (!codigo || !remessa.id_externo) throw new Error("Código da TI não encontrado.");
    const payload = montarPayload({ codigo, remessa: remessa.id_externo, numero: nf.numero, chave: nf.chave_acesso, naturezaId: Number(natureza.bling_natureza_id), contato: { nome: matriz.razao_social, numeroDocumento: CNPJ_MATRIZ, tipoPessoa: "J", contribuinte: 1, ie, endereco }, contagem, custos: custos.data ?? [], produtos: produtos ?? [] });
    const token = await ensureFreshToken(db, cfg);
    const nota = await criarOuRecuperar(makeBlingClient(db, cfg, token), payload, codigo, vinhaDeErro);
    await registrar("rascunho", nota.id, nota.numero);
    return json({ ok: true, bling_nfe_id: nota.id, numero: nota.numero, recuperado: nota.recuperado }, 201);
  } catch (e) {
    let erro = mensagem(e);
    if (iniciado) try { await registrar("erro", null, null, erro); } catch (r) { erro += ` · Falha ao registrar erro: ${mensagem(r)}`; }
    return json({ ok: false, erro }, 502);
  }
});