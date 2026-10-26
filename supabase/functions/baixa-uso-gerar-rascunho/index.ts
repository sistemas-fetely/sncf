import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { digitos, semZeros } from "../_shared/bling/conferir-nfe-retorno.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e));
const CNPJ_MATRIZ = "63591078000148";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ ok: false, erro: "Não autorizado" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ ok: false, erro: "Configuração interna incompleta" }, 500);
  const jwtClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: claims, error: authError } = await jwtClient.auth.getClaims(auth.slice(7));
  if (authError || !claims?.claims?.sub) return json({ ok: false, erro: "Não autorizado" }, 401);

  let baixaId = ""; let qual = "";
  try {
    const body = await req.json();
    baixaId = typeof body?.baixa_id === "string" ? body.baixa_id.trim() : "";
    qual = typeof body?.qual === "string" ? body.qual : "";
  } catch { return json({ ok: false, erro: "Corpo JSON malformado" }, 400); }
  if (!UUID.test(baixaId)) return json({ ok: false, erro: "baixa_id inválido" }, 400);
  if (qual !== "saida" && qual !== "retorno") return json({ ok: false, erro: "qual deve ser 'saida' ou 'retorno'" }, 400);

  const db = createClient(url, service);
  const { data: baixa, error: bErr } = await db.from("baixa_uso")
    .select("id,codigo,finalidade_codigo,descricao,evento_nome,centro_origem_id,status,nf_saida_id,nf_saida_numero,nf_saida_status,nf_retorno_status").eq("id", baixaId).maybeSingle();
  if (bErr) return json({ ok: false, erro: bErr.message }, 500);
  if (!baixa) return json({ ok: false, erro: "Baixa não encontrada" }, 404);
  const { data: fin, error: fErr } = await db.from("baixa_finalidade")
    .select("rotulo,natureza_operacao_id,natureza_retorno_operacao_id").eq("codigo", baixa.finalidade_codigo).single();
  if (fErr) return json({ ok: false, erro: fErr.message }, 500);
  const naturezaId = qual === "saida" ? fin.natureza_operacao_id : fin.natureza_retorno_operacao_id;
  if (!naturezaId) return json({ ok: false, erro: qual === "retorno" ? "Natureza de retorno não definida para esta finalidade." : "Natureza de saída não definida para esta finalidade." }, 422);
  const ehRetorno = qual === "retorno";
  let chaveRemessa: string | null = null;
  if (ehRetorno) {
    if (baixa.status !== "encerrada") return json({ ok: false, erro: "A NF de retorno só pode ser gerada depois de encerrar o evento." }, 422);
    const { data: vw, error: vErr } = await db.from("vw_baixa_uso").select("nf_saida_chave").eq("id", baixaId).maybeSingle();
    if (vErr) return json({ ok: false, erro: vErr.message }, 500);
    chaveRemessa = vw?.nf_saida_chave ?? null;
    if (!baixa.nf_saida_id || !chaveRemessa) return json({ ok: false, erro: "A NF de remessa da feira ainda não está autorizada" }, 422);
  }

  // Registro passa pelo token do usuário: a RPC confere a permissão da baixa (fn_baixa_uso_exigir).
  const registrar = async (status: string, blingId: number | null = null, numero: string | null = null, erro: string | null = null) => {
    const { error } = await jwtClient.rpc("fn_baixa_uso_nf_registrar", { p_baixa_id: baixaId, p_qual: qual, p_status: status, p_bling_id: blingId, p_numero: numero, p_erro: erro });
    if (error) throw error;
  };
  const vinhaDeErro = (ehRetorno ? baixa.nf_retorno_status : baixa.nf_saida_status) === "erro";
  try { await registrar("gerando"); } catch (e) { return json({ ok: false, erro: mensagem(e) }, 409); }

  try {
    const [{ data: nat, error: natErr }, { data: itensRaw, error: iErr }, { data: matriz, error: mErr }, { data: origem, error: oErr }, { data: siteSp, error: sErr }, { data: cfg, error: cfgErr }] = await Promise.all([
      db.from("naturezas_operacao").select("bling_natureza_id,nome").eq("id", naturezaId).single(),
      db.from("baixa_uso_item").select("sku,quantidade,quantidade_retornada,custo_unitario").eq("baixa_id", baixaId).order("sku"),
      db.from("parceiros_comerciais").select("razao_social,inscricao_estadual,logradouro,numero,endereco_complemento,bairro,cep,cidade,uf").eq("cnpj", CNPJ_MATRIZ).eq("ativo", true).order("created_at").limit(1).maybeSingle(),
      db.from("centro_distribuicao").select("nome,rotulo_curto").eq("id", baixa.centro_origem_id).maybeSingle(),
      db.from("centro_distribuicao").select("logradouro,numero,complemento,bairro,cep,cidade,uf").eq("codigo", "SITE-SP").maybeSingle(),
      db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
    ]);
    for (const e of [natErr, iErr, mErr, oErr, sErr, cfgErr]) if (e) throw e;
    if (!nat?.bling_natureza_id) throw new Error(`Natureza "${nat?.nome ?? naturezaId}" sem id do Bling.`);
    if (!itensRaw?.length) throw new Error("Baixa sem itens.");
    const itensBase = ehRetorno
      ? itensRaw.filter((i) => Number(i.quantidade_retornada ?? 0) > 0).map((i) => ({ ...i, quantidade: Number(i.quantidade_retornada) }))
      : itensRaw;
    if (!itensBase.length) throw new Error("Nenhuma peça voltou do evento — não há NF de retorno a gerar.");
    if (!cfg?.access_token) throw new Error("Bling não conectado.");

    // Contato: Fetely matriz SP (parceiros_comerciais), endereço completado pelo CD SITE-SP quando faltar.
    if (!matriz) throw new Error(`Cadastro da Fetely matriz (CNPJ ${CNPJ_MATRIZ}) não encontrado em parceiros.`);
    const ie = digitos(matriz.inscricao_estadual);
    if (ie.length < 8 || /^0+$/.test(ie)) throw new Error(`IE da Fetely matriz inválida no cadastro de parceiros ("${matriz.inscricao_estadual ?? ""}"). Corrija o cadastro antes de gerar a NF.`);
    const end = {
      endereco: matriz.logradouro || siteSp?.logradouro, numero: matriz.numero || siteSp?.numero,
      complemento: matriz.endereco_complemento || siteSp?.complemento || "", bairro: matriz.bairro || siteSp?.bairro,
      cep: digitos(matriz.cep || siteSp?.cep), municipio: matriz.cidade || siteSp?.cidade, uf: matriz.uf || siteSp?.uf, pais: "Brasil",
    };
    const faltando = (["endereco", "numero", "bairro", "cep", "municipio", "uf"] as const).filter((k) => !end[k]);
    if (faltando.length) throw new Error(`Endereço da Fetely matriz incompleto (${faltando.join(", ")}). Corrija o cadastro antes de gerar a NF.`);
    const contato = { nome: matriz.razao_social, numeroDocumento: CNPJ_MATRIZ, tipoPessoa: "J", contribuinte: 1, ie, endereco: end };

    const skus = itensBase.map((i) => i.sku);
    const { data: prods, error: pErr } = await db.from("sncf_produtos").select("sku,nome_operacional,nome_completo,ncm,origem_fisc,preco_custo").in("sku", skus);
    if (pErr) throw pErr;
    const porSku = new Map((prods ?? []).map((p) => [p.sku, p]));
    const semCusto: string[] = []; const semNcm: string[] = []; const semCadastro: string[] = []; const semOrigem: string[] = [];
    const itens = itensBase.map((i) => {
      const p = porSku.get(i.sku);
      if (!p) semCadastro.push(i.sku);
      const valor = i.custo_unitario ?? p?.preco_custo ?? null;
      if (valor == null) semCusto.push(i.sku);
      if (p && !p.ncm) semNcm.push(i.sku);
      if (p && (p.origem_fisc == null || p.origem_fisc === "")) semOrigem.push(i.sku);
      return { codigo: i.sku, descricao: p?.nome_operacional || p?.nome_completo || i.sku, unidade: "UN", quantidade: Number(i.quantidade), valor: Number(valor ?? 0), tipo: "P", classificacaoFiscal: p?.ncm ?? null, origem: Number(p?.origem_fisc ?? 0) };
    });
    const problemas = [
      semCadastro.length && `sem cadastro: ${semCadastro.join(", ")}`,
      semCusto.length && `sem custo: ${semCusto.join(", ")}`,
      semNcm.length && `sem NCM: ${semNcm.join(", ")}`,
      semOrigem.length && `sem origem fiscal: ${semOrigem.join(", ")}`,
    ].filter(Boolean);
    if (problemas.length) throw new Error(`SKUs com cadastro incompleto — ${problemas.join("; ")}.`);

    const fresh = await ensureFreshToken(db, cfg);
    const bling = makeBlingClient(db, cfg, fresh);
    const agora = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace(",", "");
    const origemRotulo = origem?.rotulo_curto ?? origem?.nome ?? "—";
    const payload = {
      tipo: ehRetorno ? 0 : 1, dataOperacao: agora, contato, naturezaOperacao: { id: Number(nat.bling_natureza_id) }, finalidade: 1,
      itens, parcelas: [], transporte: { fretePorConta: 9 },
      ...(ehRetorno ? { documentoReferenciado: { modelo: "55", chaveAcesso: chaveRemessa } } : {}),
      observacoes: ehRetorno
        ? `Retorno de exposição/feira — baixa ${baixa.codigo}${baixa.evento_nome ? ` · ${baixa.evento_nome}` : ""}. Ref. NF ${baixa.nf_saida_numero ?? ""}. SNCF.`
        : `Baixa para uso ${baixa.codigo} — ${fin.rotulo}${baixa.evento_nome ? ` · ${baixa.evento_nome}` : ""}.${baixa.descricao ? ` ${baixa.descricao}.` : ""} Origem: ${origemRotulo}. SNCF.`,
    };

    // Anti-duplicata: NFs pendentes para a matriz, não usadas em outra baixa, com os mesmos SKUs/quantidades.
    const esperado = new Map<string, number>();
    for (const i of itens) esperado.set(i.codigo, (esperado.get(i.codigo) ?? 0) + i.quantidade);
    const mesmosItens = (nf: any) => {
      const achado = new Map<string, number>();
      for (const it of nf?.itens ?? []) { const c = String(it.codigo ?? ""); achado.set(c, (achado.get(c) ?? 0) + Number(it.quantidade ?? 0)); }
      if (achado.size !== esperado.size) return false;
      for (const [k, v] of esperado) if (Math.abs((achado.get(k) ?? -1) - v) > 1e-6) return false;
      return true;
    };
    const buscarCandidatas = async () => {
      const colUsada = ehRetorno ? "nf_retorno_numero" : "nf_saida_numero";
      const { data: usados, error: uErr } = await db.from("baixa_uso").select(colUsada).not(colUsada, "is", null);
      if (uErr) throw uErr;
      const numerosUsados = new Set((usados ?? []).map((u: Record<string, string | null>) => semZeros(u[colUsada])));
      const candidatas: Array<{ id: number; numero: string }> = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const res = await bling.get(`/nfe?tipo=${ehRetorno ? 0 : 1}&situacao=1&pagina=${pagina}&limite=100`);
        const lista: Array<{ id: number; numero: string; contato?: { numeroDocumento?: string } }> = res?.data ?? [];
        for (const n of lista) {
          if (digitos(n.contato?.numeroDocumento) !== CNPJ_MATRIZ) continue;
          if (numerosUsados.has(semZeros(n.numero))) continue;
          const nf = (await bling.get(`/nfe/${n.id}`))?.data;
          if (nf && mesmosItens(nf)) candidatas.push({ id: Number(n.id), numero: String(nf.numero ?? n.numero) });
        }
        if (lista.length < 100) break;
      }
      return candidatas;
    };
    const duplicadas = (n: number) => new Error(`Há ${n} notas iguais pendentes no Bling — exclua as duplicadas e tente de novo`);
    const recuperar = async (achada: { id: number; numero: string }) => {
      await registrar("rascunho", achada.id, achada.numero, null);
      return json({ ok: true, numero: achada.numero, bling_nfe_id: achada.id, recuperado: true, alertas: [] }, 201);
    };

    if (vinhaDeErro) {
      const previas = await buscarCandidatas();
      if (previas.length === 1) return await recuperar(previas[0]);
      if (previas.length > 1) throw duplicadas(previas.length);
    }

    // Criação de NF não é idempotente: nunca repetir o POST automaticamente.
    let resposta: any;
    try {
      resposta = await bling.post("/nfe", payload, { retry: false });
    } catch (postErro) {
      const txt = mensagem(postErro).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const duplicidade = txt.includes("ja existe uma nota fiscal cadastrada");
      const incerto = !(postErro instanceof BlingHttpError) || postErro.status >= 500 || postErro.status === 429;
      if (!duplicidade && !incerto) throw postErro;
      let candidatas: Array<{ id: number; numero: string }> = [];
      for (let tentativa = 1; tentativa <= 4; tentativa++) {
        if (tentativa > 1) await new Promise((r) => setTimeout(r, 5000));
        candidatas = await buscarCandidatas();
        if (candidatas.length > 0) break;
      }
      if (candidatas.length === 1) return await recuperar(candidatas[0]);
      if (candidatas.length > 1) throw duplicadas(candidatas.length);
      throw new Error(`Bling não confirmou a criação e a NF não apareceu nos pendentes após 4 buscas — confira no Bling antes de tentar de novo. (erro original: ${mensagem(postErro)})`);
    }
    const blingId = Number(resposta?.data?.id); const numero = String(resposta?.data?.numero ?? "");
    if (!Number.isFinite(blingId)) throw new Error(`Bling retornou sucesso sem data.id: ${JSON.stringify(resposta).slice(0, 500)}`);
    await registrar("rascunho", blingId, numero || null, null);
    return json({ ok: true, numero: numero || null, bling_nfe_id: blingId, alertas: resposta?.data?.alertas ?? [] }, 201);
  } catch (e) {
    const erro = mensagem(e);
    try { await registrar("erro", null, null, erro); } catch (registroErro) { return json({ ok: false, erro: `${erro} · Falha ao registrar o erro: ${mensagem(registroErro)}` }, 502); }
    return json({ ok: false, erro }, 502);
  }
});
