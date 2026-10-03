import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { digitos } from "../_shared/bling/conferir-nfe-retorno.ts";

// deno-lint-ignore-file no-explicit-any
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : (e && typeof e === "object" && "message" in e ? String((e as any).message) : String(e));
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ItemDados = { sku: string; descricao: string; quantidade: number; valor: number; unidade: string | null; ncm: string | null; origem: number | null };
type Dados = {
  devolucao_numero: string; natureza_bling_id: number | null; nf_origem_numero: string | null; nf_origem_chave: string | null;
  destinatario: { nome: string; numeroDocumento: string; tipoPessoa: string } | null; itens: ItemDados[]; valor: number;
};

/** Conferidor local: NF de ENTRADA pendente que bate com a devolução. null = bate. */
function divergenciaNfeDevolucao(nf: any, esp: { doc: string; valor: number; itens: Array<{ sku: string; quantidade: number }> }): string | null {
  const nome = `A NF ${nf?.numero ?? "?"}`;
  if (Number(nf?.situacao) !== 1) return `${nome} não está pendente (situação ${nf?.situacao}).`;
  if (Number(nf?.tipo) !== 0) return `${nome} não é de entrada.`;
  const docNf = digitos(nf?.contato?.numeroDocumento);
  if (docNf !== esp.doc) return `${nome} é para o documento ${docNf || "(vazio)"}, esperado ${esp.doc}.`;
  const valorNf = Number(nf?.valorNota ?? 0);
  if (Math.abs(valorNf - esp.valor) > 0.02) return `${nome} tem valor ${brl(valorNf)}, esperado ${brl(esp.valor)}.`;
  const soma = (arr: Array<{ c: string; q: number }>) => arr.reduce((m, i) => m.set(i.c, (m.get(i.c) ?? 0) + i.q), new Map<string, number>());
  const qNf = soma((nf?.itens ?? []).map((i: any) => ({ c: String(i.codigo ?? "").trim(), q: Number(i.quantidade) })));
  const qEsp = soma(esp.itens.map((i) => ({ c: String(i.sku).trim(), q: Number(i.quantidade) })));
  for (const [c, q] of qEsp) {
    const qn = qNf.get(c);
    if (qn === undefined || Math.abs(qn - q) > 0.0001) return `${nome} diverge no item ${c}.`;
  }
  for (const c of qNf.keys()) if (!qEsp.has(c)) return `${nome} tem item ${c} fora da devolução.`;
  return null;
}

/** Mesma regra de detectarCancelamento do sync-nfe. */
function cancelada(d: any): boolean {
  const sc = d?.situacaoCancelamento;
  const scVal = sc != null && typeof sc === "object" ? sc.valor : sc;
  let porSc = false;
  if (scVal != null && scVal !== "" && scVal !== false) {
    const n = Number(scVal);
    porSc = Number.isFinite(n) ? n > 0 : !/^(nao|não|n|0|false|sem)/i.test(String(scVal).trim());
  }
  const c = d?.cancelamento;
  const porC = c != null && c !== "" && c !== false && (typeof c !== "object" || Object.keys(c).length > 0);
  return porSc || porC;
}

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
  const userId = claims?.claims?.sub;
  if (authError || !userId) return json({ ok: false, erro: "Não autorizado" }, 401);
  const { data: permitido, error: permError } = await jwtClient.rpc("tem_permissao", { p_slug: "tela.devolucoes", p_user: userId });
  if (permError) return json({ ok: false, erro: permError.message }, 500);
  if (!permitido) return json({ ok: false, erro: "Sem permissão para devoluções" }, 403);

  let devId = ""; let acao = "";
  try {
    const body = await req.json();
    devId = typeof body?.devolucao_id === "string" ? body.devolucao_id.trim() : "";
    acao = body?.acao;
  } catch { return json({ ok: false, erro: "Corpo JSON malformado" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(devId)) return json({ ok: false, erro: "devolucao_id inválido" }, 400);
  if (acao !== "gerar" && acao !== "verificar") return json({ ok: false, erro: "acao deve ser 'gerar' ou 'verificar'" }, 400);

  const db = createClient(url, service);
  const registrar = async (status: string, blingId: number | null = null, numero: string | null = null, erro: string | null = null, chave: string | null = null) => {
    const { data, error } = await db.rpc("fn_devolucao_nf_registrar", { p_devolucao_id: devId, p_status: status, p_bling_id: blingId, p_numero: numero, p_erro: erro, p_chave: chave });
    if (error) throw error; return data;
  };
  const blingCliente = async () => {
    const { data: cfg, error } = await db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (error) throw error;
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    return makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));
  };

  if (acao === "verificar") {
    try {
      const { data: dev, error } = await db.from("devolucao").select("nf_dev_bling_id,nf_dev_numero,nf_dev_status").eq("id", devId).single();
      if (error) throw error;
      if (!dev?.nf_dev_bling_id) return json({ ok: false, erro: "Devolução sem rascunho de NF no Bling." }, 409);
      const bling = await blingCliente();
      const nf = (await bling.get(`/nfe/${dev.nf_dev_bling_id}`))?.data;
      if (!nf) throw new Error("Bling não devolveu a NF.");
      const situacao = Number(nf.situacao);
      if ((situacao === 5 || situacao === 6) && !cancelada(nf)) {
        const numero = String(nf.numero ?? dev.nf_dev_numero ?? "");
        await registrar("autorizada", Number(dev.nf_dev_bling_id), numero || null, null, nf.chaveAcesso ?? null);
        return json({ ok: true, autorizada: true, numero, situacao });
      }
      return json({ ok: true, autorizada: false, situacao, cancelada: cancelada(nf) });
    } catch (e) { return json({ ok: false, erro: mensagem(e) }, 502); }
  }

  try { await registrar("gerando"); } catch (e) { return json({ ok: false, erro: mensagem(e) }, 409); }

  try {
    const { data: dadosRaw, error: dadosError } = await db.rpc("fn_devolucao_dados_nf", { p_devolucao_id: devId });
    if (dadosError) throw dadosError;
    const d = dadosRaw as Dados;
    if (!d?.itens?.length) throw new Error("Devolução sem itens para a NF.");
    if (!d.natureza_bling_id) throw new Error("Canal sem natureza de devolução configurada no Bling.");
    if (!d.destinatario?.numeroDocumento) throw new Error("Devolução sem destinatário com documento.");
    if (!d.nf_origem_chave) throw new Error("NF original sem chave de acesso.");
    const bling = await blingCliente();
    const agora = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()).replace(",", "");
    const payload = {
      tipo: 0, finalidade: 4, dataOperacao: agora, contato: d.destinatario,
      naturezaOperacao: { id: d.natureza_bling_id },
      documentoReferenciado: { modelo: "55", chaveAcesso: d.nf_origem_chave },
      itens: d.itens.map((i) => ({ codigo: i.sku, descricao: i.descricao, unidade: i.unidade || "UN", quantidade: i.quantidade, valor: i.valor, tipo: "P", classificacaoFiscal: i.ncm, origem: i.origem })),
      parcelas: [], transporte: { fretePorConta: 9 },
      observacoes: `Devolução de venda referente à NF ${d.nf_origem_numero} (chave ${d.nf_origem_chave}). ${d.devolucao_numero} — SNCF.`,
    };
    // Criação de NF não é idempotente: nunca repetir o POST.
    let resposta: any;
    try {
      resposta = await bling.post("/nfe", payload, { retry: false });
    } catch (postErro) {
      const txt = mensagem(postErro).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const duplicidade = txt.includes("ja existe uma nota fiscal cadastrada");
      const incerto = !(postErro instanceof BlingHttpError) || postErro.status >= 500 || postErro.status === 429;
      if (!duplicidade && !incerto) throw postErro;
      const doc = digitos(d.destinatario.numeroDocumento);
      const { data: usados, error: usadosError } = await db.from("devolucao").select("nf_dev_bling_id").not("nf_dev_bling_id", "is", null);
      if (usadosError) throw usadosError;
      const idsUsados = new Set((usados ?? []).map((u: any) => Number(u.nf_dev_bling_id)));
      const candidatas: Array<{ id: number; numero: string }> = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const res = await bling.get(`/nfe?tipo=0&situacao=1&pagina=${pagina}&limite=100`);
        const lista: any[] = res?.data ?? [];
        for (const n of lista) {
          if (digitos(n.contato?.numeroDocumento) !== doc) continue;
          if (idsUsados.has(Number(n.id))) continue;
          const nf = (await bling.get(`/nfe/${n.id}`))?.data;
          if (!nf) continue;
          if (!divergenciaNfeDevolucao(nf, { doc, valor: Number(d.valor ?? 0), itens: d.itens })) candidatas.push({ id: Number(n.id), numero: String(nf.numero ?? n.numero) });
        }
        if (lista.length < 100) break;
      }
      if (candidatas.length !== 1) {
        throw new Error(`Bling não confirmou a criação e não foi possível identificar a NF de devolução — confira as NFs de entrada pendentes no Bling. (${candidatas.length} candidata(s); erro original: ${mensagem(postErro)})`);
      }
      const achada = candidatas[0];
      await registrar("rascunho", achada.id, achada.numero);
      return json({ ok: true, numero: achada.numero, bling_nfe_id: achada.id, recuperado: true }, 201);
    }
    const blingId = Number(resposta?.data?.id); const numero = String(resposta?.data?.numero ?? "");
    if (!Number.isFinite(blingId)) throw new Error(`Bling retornou sucesso sem data.id: ${JSON.stringify(resposta).slice(0, 500)}`);
    await registrar("rascunho", blingId, numero || null);
    return json({ ok: true, numero: numero || null, bling_nfe_id: blingId, alertas: resposta?.data?.alertas ?? [] }, 201);
  } catch (e) {
    const erro = mensagem(e);
    try { await registrar("erro", null, null, erro); } catch (re) { return json({ ok: false, erro: `${erro} · Falha ao registrar o erro: ${mensagem(re)}` }, 502); }
    return json({ ok: false, erro }, 502);
  }
});
