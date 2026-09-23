// CORRIGIR NO BLING PELA MATRIZ (23/09/2026).
// O PUT /produtos/{id} do Bling SUBSTITUI o cadastro inteiro: SEMPRE GET antes,
// clona o objeto atual e altera só os campos da matriz (mesma regra de atualizar-nomes-bling).
// Campo vazio na matriz nunca sobrescreve o Bling. tributacao.origem nunca é tocada.
// dry_run é o default: só escreve com dry_run explicitamente false.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient, BLING_BASE } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const TETO = 50;
const TOL = 0.005;

type DePara = { campo: string; bling: unknown; novo: unknown };
type Resultado = { sku: string; status: string; bling_id?: string; de_para?: DePara[]; erro?: string };

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const num = (v: unknown): number | null => {
  if (vazio(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const inicio = Date.now();
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    if (userErr || !userData.user) return json({ ok: false, erro: "Não autorizado" }, 401);

    let body: any = {};
    try { body = await req.json(); } catch (_) { /* sem body */ }
    const skus: string[] = Array.isArray(body?.skus)
      ? [...new Set<string>(body.skus.map((s: unknown) => String(s).trim()).filter(Boolean))]
      : [];
    const dryRun = body?.dry_run === false ? false : true;
    const ativarCard = body?.ativar_card === true;
    if (!skus.length) return json({ ok: false, erro: "Informe ao menos um SKU em skus." }, 400);
    if (skus.length > TETO) return json({ ok: false, erro: `Teto de ${TETO} SKUs por chamada (recebido ${skus.length}).` }, 400);

    const [cacheQ, fichaQ, faseQ] = await Promise.all([
      supabase.from("bling_produtos_cache").select("sku, bling_produto_id").in("sku", skus),
      supabase.from("sncf_produtos")
        .select("sku, cod_cadastro, nome_operacional, preco_varejo, ean, dun, peso_g, largura_cm, altura_cm, profundidade_cm, ncm, cest")
        .in("sku", skus),
      supabase.from("vw_produto_mesa_lista").select("sku, fase").in("sku", skus),
    ]);
    if (cacheQ.error) return json({ ok: false, erro: `bling_produtos_cache: ${cacheQ.error.message}` }, 500);
    if (fichaQ.error) return json({ ok: false, erro: `sncf_produtos: ${fichaQ.error.message}` }, 500);
    if (faseQ.error) return json({ ok: false, erro: `vw_produto_mesa_lista: ${faseQ.error.message}` }, 500);

    const blingIds = new Map<string, string>();
    for (const c of cacheQ.data ?? []) if (c.bling_produto_id) blingIds.set(c.sku, String(c.bling_produto_id));
    const fichas = new Map<string, any>((fichaQ.data ?? []).map((f: any) => [f.sku, f]));
    const fases = new Map<string, string | null>((faseQ.data ?? []).map((f: any) => [f.sku, f.fase]));

    // Inner do cartório por cod_cadastro (itensPorCaixa do Bling). Só vale inner_qtd >= 1.
    const inners = new Map<string, number>();
    const codCadastros = [...new Set((fichaQ.data ?? []).map((f: any) => f.cod_cadastro).filter(Boolean))] as string[];
    if (codCadastros.length) {
      const { data: cartQ, error: cartErr } = await supabase
        .from("cartorio_codigo").select("cod_cadastro, inner_qtd").in("cod_cadastro", codCadastros);
      if (cartErr) return json({ ok: false, erro: `cartorio_codigo: ${cartErr.message}` }, 500);
      for (const c of cartQ ?? []) {
        if (c.cod_cadastro && c.inner_qtd !== null && Number(c.inner_qtd) >= 1 && !inners.has(c.cod_cadastro)) {
          inners.set(c.cod_cadastro, Number(c.inner_qtd));
        }
      }
    }

    const resultados: Resultado[] = [];
    let client: ReturnType<typeof makeBlingClient> | null = null;
    if ([...blingIds.keys()].length) {
      const { data: cfg, error: cfgErr } = await supabase.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
      if (cfgErr) return json({ ok: false, erro: `Falha ao ler config do Bling: ${cfgErr.message}` }, 500);
      if (!cfg || !cfg.access_token) return json({ ok: false, erro: "Bling não conectado" }, 409);
      try {
        client = makeBlingClient(supabase, cfg as any, await ensureFreshToken(supabase, cfg as any));
      } catch (e) {
        return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 401);
      }
    }

    let primeiro = true;
    for (const sku of skus) {
      const blingId = blingIds.get(sku);
      if (!blingId) { resultados.push({ sku, status: "sem_cadastro_no_bling" }); continue; }
      const f = fichas.get(sku);
      if (!f) { resultados.push({ sku, bling_id: blingId, status: "sem_ficha_sncf" }); continue; }

      if (!primeiro) await sleep(THROTTLE_MS);
      primeiro = false;

      let atual: any = null;
      try {
        const r = await client!.get(`/produtos/${blingId}`);
        atual = r?.data ?? null;
      } catch (e) {
        resultados.push({ sku, bling_id: blingId, status: "erro_get", erro: e instanceof Error ? e.message : String(e) });
        continue;
      }
      if (!atual?.id) { resultados.push({ sku, bling_id: blingId, status: "erro_get", erro: "GET /produtos retornou vazio ou sem id" }); continue; }

      const novo: any = { ...atual, dimensoes: { ...(atual.dimensoes ?? {}) }, tributacao: { ...(atual.tributacao ?? {}) } };
      const de_para: DePara[] = [];
      const setTxt = (campo: string, get: () => unknown, set: (v: string) => void, valor: unknown) => {
        if (vazio(valor)) return;
        const v = txt(valor);
        if (txt(get()) !== v) { de_para.push({ campo, bling: get() ?? null, novo: v }); set(v); }
      };
      const setNum = (campo: string, get: () => unknown, set: (v: number) => void, valor: number | null) => {
        if (valor === null) return;
        const a = num(get());
        if (a === null || Math.abs(a - valor) > TOL) { de_para.push({ campo, bling: get() ?? null, novo: valor }); set(valor); }
      };

      setTxt("nome", () => atual.nome, (v) => (novo.nome = v), f.nome_operacional);
      setNum("preco", () => atual.preco, (v) => (novo.preco = v), num(f.preco_varejo));
      setTxt("gtin", () => atual.gtin, (v) => (novo.gtin = v), f.ean);
      const pesoKg = num(f.peso_g) === null ? null : Math.round((num(f.peso_g)! / 1000) * 100000) / 100000;
      setNum("pesoLiquido", () => atual.pesoLiquido, (v) => (novo.pesoLiquido = v), pesoKg);
      setNum("pesoBruto", () => atual.pesoBruto, (v) => (novo.pesoBruto = v), pesoKg);
      setNum("largura", () => atual.dimensoes?.largura, (v) => (novo.dimensoes.largura = v), num(f.largura_cm));
      setNum("altura", () => atual.dimensoes?.altura, (v) => (novo.dimensoes.altura = v), num(f.altura_cm));
      setNum("profundidade", () => atual.dimensoes?.profundidade, (v) => (novo.dimensoes.profundidade = v), num(f.profundidade_cm));
      // Dimensões vão em centímetros: unidadeMedida 2 = cm (1 = metros). Sem isso o Bling lê 21,20 metros.
      const dimMudou =
        novo.dimensoes.largura !== atual.dimensoes?.largura ||
        novo.dimensoes.altura !== atual.dimensoes?.altura ||
        novo.dimensoes.profundidade !== atual.dimensoes?.profundidade;
      const unidadeAtual = num(atual.dimensoes?.unidadeMedida);
      if (dimMudou || unidadeAtual !== 2) {
        novo.dimensoes.unidadeMedida = 2;
        if (unidadeAtual !== 2) {
          de_para.push({ campo: "unidadeMedida", bling: atual.dimensoes?.unidadeMedida ?? null, novo: 2 });
        }
      }
      setTxt("gtinEmbalagem", () => atual.gtinEmbalagem, (v) => (novo.gtinEmbalagem = v), f.dun);
      setNum("itensPorCaixa", () => atual.itensPorCaixa, (v) => (novo.itensPorCaixa = v), inners.get(f.cod_cadastro) ?? null);
      const soDig = (v: unknown) => (vazio(v) ? null : String(v).replace(/\D/g, "") || null);
      setTxt("ncm", () => soDig(atual.tributacao?.ncm), (v) => (novo.tributacao.ncm = v), soDig(f.ncm));
      setTxt("cest", () => soDig(atual.tributacao?.cest), (v) => (novo.tributacao.cest = v), soDig(f.cest));
      if (ativarCard) {
        const alvo = fases.get(sku) === "ativo" ? "A" : "I";
        if (txt(atual.situacao) !== alvo) { de_para.push({ campo: "situacao", bling: atual.situacao ?? null, novo: alvo }); novo.situacao = alvo; }
      }

      if (!de_para.length) { resultados.push({ sku, bling_id: blingId, status: "sem_diferenca" }); continue; }
      if (dryRun) { resultados.push({ sku, bling_id: blingId, status: "tem_diferenca", de_para }); continue; }

      let putErro = "";
      try {
        await sleep(THROTTLE_MS);
        const res = await fetch(`${BLING_BASE}/produtos/${blingId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${client!.currentToken()}`, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(novo),
        });
        if (!res.ok) putErro = `Bling PUT ${res.status}: ${(await res.text()).slice(0, 800)}`;
      } catch (e) {
        putErro = e instanceof Error ? e.message : String(e);
      }
      if (putErro) { resultados.push({ sku, bling_id: blingId, status: "erro_put", de_para, erro: putErro }); continue; }

      const { error: upErr } = await supabase.from("bling_produtos_cache")
        .update({ nome: novo.nome, atualizado_em: new Date().toISOString() }).eq("sku", sku);

      // Espelho em dia na hora: re-GET do Bling e grava na tabela `produtos`
      // (espelho do Bling, chave bling_id) só os campos que a edge corrige,
      // para a fila refletir sem esperar o próximo sync. Falha aqui não
      // desconta o PUT — só vira aviso no de_para aplicado.
      await sleep(THROTTLE_MS);
      let avisoEspelho = "";
      try {
        const r2 = await client!.get(`/produtos/${blingId}`);
        const detalhe = r2?.data ?? null;
        if (!detalhe?.id) {
          avisoEspelho = "atualização do espelho falhou, fila pode demorar a limpar";
        } else {
          const dim = (novo.dimensoes ?? {}) as any;
          const { error: espErr } = await supabase.from("produtos").update({
            gtin: novo.gtin,
            preco_venda: novo.preco,
            peso_liquido: novo.pesoLiquido,
            peso_bruto: novo.pesoBruto,
            altura_cm: dim.altura,
            largura_cm: dim.largura,
            profundidade_cm: dim.profundidade,
            detalhe_payload: detalhe,
          }).eq("bling_id", String(blingId));
          if (espErr) avisoEspelho = `atualização do espelho falhou, fila pode demorar a limpar (${espErr.message})`;
        }
      } catch (_) {
        avisoEspelho = "atualização do espelho falhou, fila pode demorar a limpar";
      }
      if (avisoEspelho) de_para.push({ campo: "espelho", bling: null, novo: avisoEspelho });

      resultados.push({
        sku, bling_id: blingId, status: "ok", de_para,
        ...(upErr ? { erro: `Bling atualizado, mas o espelho falhou: ${upErr.message}` } : {}),
      });
    }

    if (!dryRun) {
      const oks = resultados.filter((r) => r.status === "ok");
      const falhas = resultados.filter((r) => r.status === "erro_put" || r.status === "erro_get");
      const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
        sistema: "bling",
        tipo: "produto_update",
        status: falhas.length ? (oks.length ? "parcial" : "erro") : "sucesso",
        registros_atualizados: oks.length,
        registros_erro: falhas.length,
        iniciado_por: userData.user.id,
        duracao_ms: Date.now() - inicio,
        detalhes: { ativar_card: ativarCard, oks: oks.map((r) => ({ sku: r.sku, de_para: r.de_para })), falhas: falhas.map((r) => ({ sku: r.sku, status: r.status, erro: r.erro })) },
      });
      if (logErr) return json({ ok: false, erro: `Correções feitas, mas o log falhou: ${logErr.message}`, resultados }, 500);
    }

    return json({ ok: true, dry_run: dryRun, resultados });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
