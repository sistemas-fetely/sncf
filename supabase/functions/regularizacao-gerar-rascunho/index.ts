import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { digitos, divergenciaNfeRetorno, semZeros } from "../_shared/bling/conferir-nfe-retorno.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : String(e);

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
  const token = auth.slice(7);
  const { data: claims, error: authError } = await jwtClient.auth.getClaims(token);
  const userId = claims?.claims?.sub;
  if (authError || !userId) return json({ ok: false, erro: "Não autorizado" }, 401);
  const { data: permitido, error: permError } = await jwtClient.rpc("tem_permissao", { p_slug: "tela.regularizacao_estoque", p_user: userId });
  if (permError) return json({ ok: false, erro: permError.message }, 500);
  if (!permitido) return json({ ok: false, erro: "Sem permissão para regularização de estoque" }, 403);

  let retornoId = "";
  try {
    const body = await req.json(); retornoId = typeof body?.retorno_nf_id === "string" ? body.retorno_nf_id.trim() : "";
  } catch { return json({ ok: false, erro: "Corpo JSON malformado" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retornoId)) return json({ ok: false, erro: "retorno_nf_id inválido" }, 400);

  const db = createClient(url, service);
  const registrar = async (status: string, blingId: number | null = null, numero: string | null = null, erro: string | null = null) => {
    const { data, error } = await db.rpc("reg_retorno_registrar", { p_retorno_nf_id: retornoId, p_status: status, p_bling_nfe_id: blingId, p_numero: numero, p_erro: erro });
    if (error) throw error; return data;
  };
  try { await registrar("gerando"); } catch (e) { return json({ ok: false, erro: mensagem(e) }, 409); }

  try {
    const { data: retorno, error: retError } = await db.from("regularizacao_retorno_nf").select("id,lote_id,valor,nf_origem_numero,nf_origem_chave").eq("id", retornoId).single();
    if (retError) throw retError;
    const [{ data: itens, error: itensError }, { data: lote, error: loteError }, { data: cfg, error: cfgError }] = await Promise.all([
      db.from("regularizacao_retorno_item").select("sku,descricao_origem,ncm,unidade,quantidade,valor_unit_origem").eq("retorno_nf_id", retornoId).order("sku"),
      db.from("regularizacao_lote").select("codigo,centro_destino_id,natureza_retorno_bling_id,destinatario_retorno").eq("id", retorno.lote_id).single(),
      db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
    ]);
    if (itensError) throw itensError; if (loteError) throw loteError; if (cfgError) throw cfgError;
    if (!itens?.length) throw new Error("Retorno sem itens para gerar.");
    if (!lote.natureza_retorno_bling_id) throw new Error("Lote sem natureza de retorno configurada.");
    if (!lote.destinatario_retorno) throw new Error("Lote sem destinatário de retorno configurado.");
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    const { data: centro, error: centroError } = await db.from("centro_distribuicao").select("nome,rotulo_curto").eq("id", lote.centro_destino_id).single();
    if (centroError) throw centroError;
    const fresh = await ensureFreshToken(db, cfg);
    const bling = makeBlingClient(db, cfg, fresh);
    const agora = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace(",", "");
    const payload = {
      tipo: 1, dataOperacao: agora, contato: lote.destinatario_retorno,
      naturezaOperacao: { id: lote.natureza_retorno_bling_id }, finalidade: 1,
      documentoReferenciado: { modelo: "55", chaveAcesso: retorno.nf_origem_chave },
      itens: itens.map((i) => ({ codigo: i.sku, descricao: i.descricao_origem, unidade: i.unidade || "UN", quantidade: i.quantidade, valor: i.valor_unit_origem, tipo: "P", classificacaoFiscal: i.ncm, origem: 2 })),
      parcelas: [], transporte: { fretePorConta: 9 },
      observacoes: `Retorno simbólico de simples remessa referente à NF ${retorno.nf_origem_numero} (chave ${retorno.nf_origem_chave}). Mercadoria permanece fisicamente em ${centro.rotulo_curto ?? centro.nome}. Lote ${lote.codigo} — SNCF.`,
    };
    // Criação de NF não é idempotente: nunca repetir o POST automaticamente.
    let resposta: any;
    try {
      resposta = await bling.post("/nfe", payload, { retry: false });
    } catch (postErro) {
      const txt = mensagem(postErro).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const duplicidade = txt.includes("ja existe uma nota fiscal cadastrada");
      // Sem resposta HTTP (rede/timeout) ou 5xx/429: a NF pode ter sido criada mesmo assim.
      const incerto = !(postErro instanceof BlingHttpError) || postErro.status >= 500 || postErro.status === 429;
      if (!duplicidade && !incerto) throw postErro;

      // Procurar a NF criada entre as pendentes do destinatário, ainda não vinculadas a nenhum retorno.
      const docEsperado = digitos((lote.destinatario_retorno as { numeroDocumento?: string } | null)?.numeroDocumento);
      const { data: usados, error: usadosError } = await db.from("regularizacao_retorno_nf").select("nf_retorno_numero").not("nf_retorno_numero", "is", null);
      if (usadosError) throw usadosError;
      const numerosUsados = new Set((usados ?? []).map((u: { nf_retorno_numero: string | null }) => semZeros(u.nf_retorno_numero)));
      const candidatas: Array<{ id: number; numero: string }> = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const res = await bling.get(`/nfe?tipo=1&situacao=1&pagina=${pagina}&limite=100`);
        const lista: Array<{ id: number; numero: string; contato?: { numeroDocumento?: string } }> = res?.data ?? [];
        for (const n of lista) {
          if (digitos(n.contato?.numeroDocumento) !== docEsperado) continue;
          if (numerosUsados.has(semZeros(n.numero))) continue;
          const nf = (await bling.get(`/nfe/${n.id}`))?.data;
          if (!nf) continue;
          const div = divergenciaNfeRetorno(nf, {
            docDestinatario: docEsperado, valor: Number(retorno.valor ?? 0), nfOrigemNumero: String(retorno.nf_origem_numero ?? ""),
            itens: itens.map((i) => ({ sku: String(i.sku), quantidade: Number(i.quantidade) })),
          });
          if (!div) candidatas.push({ id: Number(n.id), numero: String(nf.numero ?? n.numero) });
        }
        if (lista.length < 100) break;
      }
      if (candidatas.length !== 1) {
        throw new Error(`Bling informou duplicidade e não foi possível identificar a NF criada — confira os pendentes no Bling. (${candidatas.length} candidata(s); erro original: ${mensagem(postErro)})`);
      }
      const achada = candidatas[0];
      await registrar("rascunho", achada.id, achada.numero, null);
      return json({ ok: true, numero: achada.numero, bling_nfe_id: achada.id, recuperado: true, alertas: [] }, 201);
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
