import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const mensagem = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
const semZeros = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  const { data: permitido, error: permError } = await jwtClient.rpc("tem_permissao", { p_slug: "tela.regularizacao_estoque", p_user: userId });
  if (permError) return json({ ok: false, erro: permError.message }, 500);
  if (!permitido) return json({ ok: false, erro: "Sem permissão para regularização de estoque" }, 403);

  let retornoId = ""; let numero = "";
  try {
    const body = await req.json();
    retornoId = typeof body?.retorno_nf_id === "string" ? body.retorno_nf_id.trim() : "";
    numero = typeof body?.numero === "string" ? body.numero.trim() : "";
  } catch { return json({ ok: false, erro: "Corpo JSON malformado" }, 400); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(retornoId)) return json({ ok: false, erro: "retorno_nf_id inválido" }, 400);
  if (!/^\d{1,9}$/.test(numero) || !semZeros(numero)) return json({ ok: false, erro: "Informe o número da NF (só dígitos)." }, 400);

  const db = createClient(url, service);
  try {
    const { data: retorno, error: retError } = await db.from("regularizacao_retorno_nf").select("id,lote_id,valor,status,nf_origem_numero").eq("id", retornoId).maybeSingle();
    if (retError) throw retError;
    if (!retorno) return json({ ok: false, erro: "Retorno não encontrado." }, 404);
    if (!["planejada", "erro"].includes(retorno.status)) return json({ ok: false, erro: `Retorno está em "${retorno.status}"; só é possível vincular retornos planejados ou com erro.` }, 409);
    const [{ data: itens, error: itensError }, { data: lote, error: loteError }, { data: cfg, error: cfgError }] = await Promise.all([
      db.from("regularizacao_retorno_item").select("sku,quantidade,valor_unit_origem").eq("retorno_nf_id", retornoId),
      db.from("regularizacao_lote").select("destinatario_retorno").eq("id", retorno.lote_id).single(),
      db.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle(),
    ]);
    if (itensError) throw itensError; if (loteError) throw loteError; if (cfgError) throw cfgError;
    if (!itens?.length) throw new Error("Retorno sem itens para conferir.");
    const docEsperado = digitos((lote.destinatario_retorno as { numeroDocumento?: string } | null)?.numeroDocumento);
    if (!docEsperado) throw new Error("Lote sem destinatário de retorno configurado.");
    if (!cfg?.access_token) throw new Error("Bling não conectado.");
    const bling = makeBlingClient(db, cfg, await ensureFreshToken(db, cfg));

    const alvo = semZeros(numero);
    let achada: { id: number; numero: string } | null = null;
    for (let pagina = 1; pagina <= 50 && !achada; pagina++) {
      const res = await bling.get(`/nfe?tipo=1&situacao=1&pagina=${pagina}&limite=100`);
      const lista: Array<{ id: number; numero: string }> = res?.data ?? [];
      achada = lista.find((n) => semZeros(n.numero) === alvo) ?? null;
      if (lista.length < 100) break;
    }
    if (!achada) return json({ ok: false, erro: `Não há NF pendente nº ${numero} no Bling.` }, 404);

    const nf = (await bling.get(`/nfe/${achada.id}`))?.data;
    if (!nf) throw new Error(`Bling não devolveu a NF ${achada.numero}.`);
    const nome = `A NF ${nf.numero ?? achada.numero}`;
    const recusar = (erro: string) => json({ ok: false, erro }, 422);
    if (Number(nf.situacao) !== 1) return recusar(`${nome} não está pendente no Bling (situação ${nf.situacao}).`);
    if (Number(nf.tipo) !== 1) return recusar(`${nome} não é de saída.`);
    const docNf = digitos(nf.contato?.numeroDocumento);
    if (docNf !== docEsperado) return recusar(`${nome} é para o documento ${docNf || "(vazio)"}, o retorno espera ${docEsperado}.`);
    const valorNf = Number(nf.valorNota ?? 0); const valorRet = Number(retorno.valor ?? 0);
    if (Math.abs(valorNf - valorRet) > 0.02) return recusar(`${nome} tem valor ${brl(valorNf)}, o retorno da NF ${retorno.nf_origem_numero} é ${brl(valorRet)}.`);
    const soma = (arr: Array<{ codigo: string; quantidade: number }>) => arr.reduce((m, i) => m.set(i.codigo, (m.get(i.codigo) ?? 0) + Number(i.quantidade)), new Map<string, number>());
    const qNf = soma((nf.itens ?? []).map((i: { codigo: string; quantidade: number }) => ({ codigo: String(i.codigo ?? "").trim(), quantidade: i.quantidade })));
    const qRet = soma(itens.map((i) => ({ codigo: String(i.sku).trim(), quantidade: Number(i.quantidade) })));
    for (const [cod, q] of qRet) {
      const qn = qNf.get(cod);
      if (qn === undefined) return recusar(`${nome} não tem o item ${cod}, que o retorno espera com ${q}.`);
      if (Math.abs(qn - q) > 0.0001) return recusar(`${nome} tem o item ${cod} com ${qn}, o retorno espera ${q}.`);
    }
    for (const [cod, q] of qNf) if (!qRet.has(cod)) return recusar(`${nome} tem o item ${cod} com ${q}, que não faz parte do retorno.`);

    const numeroFinal = String(nf.numero ?? achada.numero);
    const { error: regError } = await db.rpc("reg_retorno_registrar", { p_retorno_nf_id: retornoId, p_status: "rascunho", p_bling_nfe_id: Number(achada.id), p_numero: numeroFinal, p_erro: null });
    if (regError) throw regError;
    return json({ ok: true, numero: numeroFinal, bling_nfe_id: Number(achada.id) });
  } catch (e) {
    return json({ ok: false, erro: mensagem(e) }, 502);
  }
});
