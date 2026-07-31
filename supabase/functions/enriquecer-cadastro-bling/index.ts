// Enriquecimento do espelho `produtos` com o DETALHE do Bling (GET /produtos/{id}).
// A lista (/produtos?limite=100) não traz NCM, GTIN, peso, dimensões, CEST nem origem fiscal.
// Esta função apenas LÊ do Bling. Não escreve no Bling. Não toca em bling_produtos_cache.
// Não grava nome/preços/estoque/ativo — esses são da `sincronizar-cache-bling` (produtor único).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE_MS = 350;
const RETRY_429_MS = 2000;
const MAX_TENTATIVAS = 3;
const LIMITE_DEFAULT = 100;
const LIMITE_MAX = 400;
const DRY_RUN_MAX = 3;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** Mapeia a resposta bruta de GET /produtos/{id} para as colunas do espelho. */
function mapearDetalhe(d: any) {
  const dim = d?.dimensoes ?? {};
  const trib = d?.tributacao ?? {};
  return {
    // aninhados em tributacao
    ncm: texto(trib.ncm),
    cest: texto(trib.cest),
    origem_fisc: texto(trib.origem),
    // raiz
    gtin: texto(d?.gtin),
    peso_liquido: num(d?.pesoLiquido),
    peso_bruto: num(d?.pesoBruto),
    unidade: texto(d?.unidade),
    situacao_bling: texto(d?.situacao),
    tipo_bling: texto(d?.tipo),
    formato_bling: texto(d?.formato),
    itens_por_caixa: num(d?.itensPorCaixa),
    categoria: texto(d?.categoria?.id),
    // dimensoes
    altura_cm: num(dim.altura),
    largura_cm: num(dim.largura),
    profundidade_cm: num(dim.profundidade),
  };
}


serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- body (opcional) ----
    let dryRun = false;
    let limite = LIMITE_DEFAULT;
    let forcarSkus: string[] = [];
    try {
      const body = await req.json();
      dryRun = body?.dry_run === true;
      const l = Number(body?.limite);
      if (Number.isFinite(l) && l > 0) limite = Math.min(Math.floor(l), LIMITE_MAX);
      if (Array.isArray(body?.forcar_skus)) {
        forcarSkus = body.forcar_skus.map((s: unknown) => String(s).trim()).filter(Boolean);
      }
    } catch (_) { /* sem body = execução real com default */ }
    if (dryRun) limite = Math.min(limite, DRY_RUN_MAX);

    // ---- seleção: pendentes (detalhe_lido_em IS NULL) ou reprocessamento EXPLÍCITO ----
    let q = supabase
      .from("produtos")
      .select("id, bling_id, codigo, detalhe_lido_em")
      .not("bling_id", "is", null);
    if (forcarSkus.length > 0) {
      q = q.in("codigo", forcarSkus).limit(Math.max(forcarSkus.length, limite));
    } else {
      q = q.eq("ativo", true).is("detalhe_lido_em", null).limit(limite);
    }
    const { data: fila, error: filaErr } = await q;
    if (filaErr) return json(500, { error: `Falha ao selecionar produtos: ${filaErr.message}` });

    const linhas = fila ?? [];

    // fila vazia = não chama o Bling nenhuma vez
    if (linhas.length === 0) {
      return json(200, { dry_run: dryRun, processados: 0, restantes_na_fila: 0 });
    }

    // ---- credenciais ----
    const { data: cfg, error: cfgErr } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (cfgErr) return json(500, { error: `Falha ao ler config do Bling: ${cfgErr.message}` });
    if (!cfg || !cfg.access_token) return json(409, { error: "Bling não conectado" });

    let client;
    try {
      const freshToken = await ensureFreshToken(supabase, cfg as any);
      client = makeBlingClient(supabase, cfg as any, freshToken);
    } catch (e) {
      return json(401, { error: e instanceof Error ? e.message : String(e) });
    }


    const erros: { bling_id: string | null; codigo: string | null; mensagem: string }[] = [];
    const previa: unknown[] = [];
    let comSucesso = 0;
    const campos_preenchidos = { ncm: 0, gtin: 0, peso_liquido: 0, cest: 0, dimensoes: 0 };

    for (let i = 0; i < linhas.length; i++) {
      const p: any = linhas[i];
      if (i > 0) await sleep(THROTTLE_MS);

      let detalhe: any = null;
      let ultimoErro = "";
      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        try {
          const r = await client.get(`/produtos/${p.bling_id}`);
          detalhe = r?.data ?? r;
          ultimoErro = "";
          break;
        } catch (e) {
          ultimoErro = e instanceof Error ? e.message : String(e);
          if (ultimoErro.includes("429") && tentativa < MAX_TENTATIVAS) {
            await sleep(RETRY_429_MS);
            continue;
          }
          break;
        }
      }

      // erro: registra no espelho e segue — nunca aborta o lote
      if (!detalhe) {
        erros.push({ bling_id: p.bling_id, codigo: p.codigo, mensagem: ultimoErro || "Sem resposta do Bling" });
        if (!dryRun) {
          const { error: upErr } = await supabase
            .from("produtos")
            .update({ detalhe_erro: ultimoErro || "Sem resposta do Bling", detalhe_lido_em: null })
            .eq("id", p.id);
          if (upErr) {
            erros.push({ bling_id: p.bling_id, codigo: p.codigo, mensagem: `Falha ao gravar erro: ${upErr.message}` });
          }
        }
        continue;
      }

      const campos = mapearDetalhe(detalhe);
      if (campos.ncm) campos_preenchidos.ncm++;
      if (campos.gtin) campos_preenchidos.gtin++;
      if (campos.peso_liquido !== null) campos_preenchidos.peso_liquido++;
      if (campos.cest) campos_preenchidos.cest++;
      if (campos.altura_cm !== null || campos.largura_cm !== null || campos.profundidade_cm !== null) {
        campos_preenchidos.dimensoes++;
      }

      if (dryRun) {
        previa.push({ id: p.id, bling_id: p.bling_id, codigo: p.codigo, gravaria: campos });
        comSucesso++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("produtos")
        .update({
          ...campos,
          detalhe_payload: detalhe,
          detalhe_lido_em: new Date().toISOString(),
          detalhe_erro: null,
        })
        .eq("id", p.id);

      if (upErr) {
        erros.push({ bling_id: p.bling_id, codigo: p.codigo, mensagem: `Falha ao gravar espelho: ${upErr.message}` });
        continue;
      }
      comSucesso++;
    }

    // ---- quanto sobrou na fila ----
    const { count: restantes, error: cntErr } = await supabase
      .from("produtos")
      .select("id", { count: "exact", head: true })
      .eq("ativo", true)
      .not("bling_id", "is", null)
      .is("detalhe_lido_em", null);
    if (cntErr) return json(500, { error: `Falha ao contar fila restante: ${cntErr.message}` });

    return json(200, {
      dry_run: dryRun,
      processados: linhas.length,
      com_sucesso: comSucesso,
      com_erro: erros.length,
      restantes_na_fila: restantes ?? 0,
      campos_preenchidos,
      erros,
      ...(dryRun ? { previa } : {}),
    });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
});
