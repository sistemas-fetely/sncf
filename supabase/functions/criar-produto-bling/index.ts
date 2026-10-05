// Nascimento de produto no Bling (POST /produtos v3).
// Mesmo padrão de `atualizar-nomes-bling`: auth por sessão + client Bling com refresh de token,
// throttle de 350ms, dry-run por padrão.
// Dois portões: ficha furada (vw_produto_ficha_pendencias) e duplicidade (bling_produtos_cache).
// Nunca assume origem fiscal: é decisão humana/contador.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const THROTTLE_MS = 350;
const ORIGENS_OK = ["0", "1", "2"];

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, erro: "Use POST" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- auth ----
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ ok: false, erro: "Não autorizado" }, 401);

    // ---- permissão ----
    const uid = userData.user.id;
    const { data: ehSuper, error: eSuper } = await supabase.rpc("has_role", { _user_id: uid, _role: "super_admin" });
    if (eSuper) return json({ ok: false, erro: `Falha ao verificar permissão: ${eSuper.message}` }, 500);
    if (!ehSuper) {
      const { data: pode, error: ePode } = await supabase.rpc("usuario_tem_acao", {
        p_slug: "acao.produto_corrigir_externo",
        p_user_id: uid,
      });
      if (ePode) return json({ ok: false, erro: `Falha ao verificar permissão: ${ePode.message}` }, 500);
      if (!pode) return json({ ok: false, erro: "Sem permissão para criar card no Bling" }, 403);
    }

    // ---- body ----
    let skus: string[] = [];
    let executar = false;
    let origemFiscal: string | null = null;
    try {
      const body = await req.json();
      if (Array.isArray(body?.skus)) {
        skus = body.skus.map((s: unknown) => String(s).trim()).filter(Boolean);
      }
      executar = body?.executar === true;
      origemFiscal = texto(body?.origem_fiscal);
    } catch (_) {
      return json({ ok: false, erro: "Corpo JSON malformado" }, 400);
    }

    if (skus.length === 0) return json({ ok: false, erro: "Informe skus: string[]" }, 400);
    if (skus.length > 20) return json({ ok: false, erro: "Máximo 20 SKUs por chamada" }, 400);

    if (executar) {
      if (!origemFiscal || !ORIGENS_OK.includes(origemFiscal)) {
        return json(
          { ok: false, erro: "origem_fiscal é obrigatória com executar=true (aceita '0', '1' ou '2')" },
          400,
        );
      }
    }

    // ---- fichas ----
    const { data: fichas, error: fichaErr } = await supabase
      .from("sncf_produtos")
      .select("*")
      .in("sku", skus);
    if (fichaErr) return json({ ok: false, erro: `Falha ao ler sncf_produtos: ${fichaErr.message}` }, 500);
    const porSku = new Map<string, any>();
    for (const f of fichas || []) porSku.set(f.sku, f);

    // ---- PORTÃO 1: pendências de ficha (ignora 'ficha_bling') ----
    const { data: pend, error: pendErr } = await supabase
      .from("vw_produto_ficha_pendencias")
      .select("sku, campo")
      .in("sku", skus);
    if (pendErr) return json({ ok: false, erro: `Falha ao ler vw_produto_ficha_pendencias: ${pendErr.message}` }, 500);
    const pendPorSku = new Map<string, string[]>();
    for (const r of (pend || []) as any[]) {
      if (r.campo === "ficha_bling") continue;
      const lista = pendPorSku.get(r.sku) ?? [];
      lista.push(r.campo);
      pendPorSku.set(r.sku, lista);
    }

    // ---- PORTÃO 2: já existe no Bling ----
    const { data: cache, error: cacheErr } = await supabase
      .from("bling_produtos_cache")
      .select("sku, bling_produto_id")
      .in("sku", skus);
    if (cacheErr) return json({ ok: false, erro: `Falha ao ler bling_produtos_cache: ${cacheErr.message}` }, 500);
    const jaExiste = new Set<string>((cache || []).map((c: any) => c.sku));

    // ---- PORTÃO 3: nome repetido (Bling espelho, outros SNCF, mesmo lote) ----
    const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
    const escLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
    const nomesLote = new Map<string, string[]>(); // nome normalizado -> skus do lote
    for (const sku of skus) {
      const n = norm(porSku.get(sku)?.nome_operacional);
      if (!n) continue;
      nomesLote.set(n, [...(nomesLote.get(n) ?? []), sku]);
    }
    const repetidoCom = new Map<string, Set<string>>(); // nome normalizado -> códigos conflitantes
    const addConf = (n: string, cod: string) => {
      const s = repetidoCom.get(n) ?? new Set<string>();
      s.add(cod);
      repetidoCom.set(n, s);
    };
    try {
      await Promise.all(
        [...nomesLote.keys()].map(async (n) => {
          const padrao = `%${escLike(n)}%`;
          const [rb, rs] = await Promise.all([
            supabase.from("produtos").select("codigo, nome").ilike("nome", padrao),
            supabase
              .from("sncf_produtos")
              .select("sku, nome_operacional, fase")
              .ilike("nome_operacional", padrao)
              .in("fase", ["ativo", "pre_venda", "inativo"]),
          ]);
          if (rb.error) throw new Error(`Falha ao ler produtos: ${rb.error.message}`);
          if (rs.error) throw new Error(`Falha ao ler sncf_produtos (nomes): ${rs.error.message}`);
          for (const p of (rb.data ?? []) as any[]) {
            if (norm(p.nome) === n && p.codigo) addConf(n, String(p.codigo));
          }
          for (const p of (rs.data ?? []) as any[]) {
            if (norm(p.nome_operacional) === n) addConf(n, String(p.sku));
          }
        }),
      );
    } catch (e) {
      return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
    }
    function conflitosDe(sku: string): string[] {
      const n = norm(porSku.get(sku)?.nome_operacional);
      if (!n) return [];
      const out = new Set<string>();
      for (const c of repetidoCom.get(n) ?? []) if (c !== sku) out.add(c);
      for (const c of nomesLote.get(n) ?? []) if (c !== sku) out.add(c);
      return [...out];
    }

    const recusados: { sku: string; motivo: string }[] = [];
    const criar: { sku: string; payload: any }[] = [];


    for (const sku of skus) {
      const f = porSku.get(sku);
      if (!f) {
        recusados.push({ sku, motivo: "não encontrado em sncf_produtos" });
        console.log(`[criar-produto-bling] ${sku}: recusado — sem ficha`);
        continue;
      }
      if (jaExiste.has(sku)) {
        recusados.push({ sku, motivo: "já existe no Bling" });
        console.log(`[criar-produto-bling] ${sku}: recusado — já existe no Bling`);
        continue;
      }
      const faltando = pendPorSku.get(sku);
      if (faltando && faltando.length > 0) {
        recusados.push({ sku, motivo: `ficha pendente: ${faltando.join(", ")}` });
        console.log(`[criar-produto-bling] ${sku}: recusado — ficha pendente (${faltando.join(", ")})`);
        continue;
      }
      const nome = texto(f.nome_operacional);
      if (!nome) {
        recusados.push({ sku, motivo: "nome_operacional vazio" });
        console.log(`[criar-produto-bling] ${sku}: recusado — nome_operacional vazio`);
        continue;
      }
      const conf = conflitosDe(sku);
      if (conf.length > 0) {
        recusados.push({ sku, motivo: `nome repetido: igual a ${conf.join(", ")}` });
        console.log(`[criar-produto-bling] ${sku}: recusado — nome repetido (${conf.join(", ")})`);
        continue;
      }

      if (!texto(f.ncm)) {
        recusados.push({ sku, motivo: "sem NCM (decisão fiscal)" });
        console.log(`[criar-produto-bling] ${sku}: recusado — sem NCM`);
        continue;
      }

      const pesoKg = num(f.peso_g) !== null ? Number(f.peso_g) / 1000 : null;
      const payload: any = {
        nome,
        codigo: sku,
        tipo: "P",
        formato: "S",
        situacao: f.fase === "ativo" ? "A" : "I", // card nasce na situação da fase (28/09)
        unidade: "UN",
        preco: num(f.preco_varejo),
        pesoLiquido: pesoKg,
        pesoBruto: pesoKg,
        dimensoes: {
          largura: num(f.largura_cm),
          altura: num(f.altura_cm),
          profundidade: num(f.profundidade_cm),
          unidadeMedida: 1,
        },
        gtin: texto(f.ean),
        tributacao: {
          origem: origemFiscal,
          ncm: texto(f.ncm),
          cest: texto(f.cest),
        },
      };
      criar.push({ sku, payload });
    }

    if (!executar) {
      console.log(`[criar-produto-bling] dry-run: ${criar.length} a criar, ${recusados.length} recusados`);
      return json({
        ok: true,
        dry_run: true,
        criar: criar.map((c) => c.payload),
        recusados,
      });
    }

    // ---- credenciais Bling ----
    if (criar.length === 0) {
      return json({ ok: true, dry_run: false, criados: [], falhas: [], recusados });
    }
    const { data: cfg, error: cfgErr } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (cfgErr) return json({ ok: false, erro: `Falha ao ler config do Bling: ${cfgErr.message}` }, 500);
    if (!cfg || !cfg.access_token) return json({ ok: false, erro: "Bling não conectado" }, 409);

    let client;
    try {
      const fresh = await ensureFreshToken(supabase, cfg as any);
      client = makeBlingClient(supabase, cfg as any, fresh);
    } catch (e) {
      return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 401);
    }

    const criados: { sku: string; bling_id: string }[] = [];
    const falhas: { sku: string; status: number | null; corpo: string }[] = [];

    for (let i = 0; i < criar.length; i++) {
      const { sku, payload } = criar[i];
      if (i > 0) await sleep(THROTTLE_MS);

      let resposta: any = null;
      try {
        resposta = await client.post("/produtos", payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const m = msg.match(/ (\d{3}):/);
        falhas.push({ sku, status: m ? Number(m[1]) : null, corpo: msg.slice(0, 500) });
        console.error(`[criar-produto-bling] ${sku}: falha no POST — ${msg}`);
        continue;
      }

      const blingId = resposta?.data?.id;
      if (!blingId) {
        falhas.push({ sku, status: 200, corpo: JSON.stringify(resposta).slice(0, 500) });
        console.error(`[criar-produto-bling] ${sku}: POST sem id na resposta`);
        continue;
      }

      const { error: cacheUpErr } = await supabase
        .from("bling_produtos_cache")
        .upsert(
          {
            sku,
            bling_produto_id: Number(blingId),
            nome: payload.nome,
            atualizado_em: new Date().toISOString(),
          },
          { onConflict: "sku" },
        );
      if (cacheUpErr) {
        falhas.push({ sku, status: null, corpo: `criado no Bling (id ${blingId}) mas falhou a cache: ${cacheUpErr.message}` });
        console.error(`[criar-produto-bling] ${sku}: falha ao gravar cache — ${cacheUpErr.message}`);
        continue;
      }

      const { error: espelhoErr } = await supabase
        .from("produtos")
        .upsert(
          {
            codigo: sku,
            nome: payload.nome,
            bling_id: String(blingId),
            ativo: payload.situacao === "A",
          },
          { onConflict: "bling_id" },
        );
      if (espelhoErr) {
        falhas.push({ sku, status: null, corpo: `criado no Bling (id ${blingId}) mas falhou o espelho: ${espelhoErr.message}` });
        console.error(`[criar-produto-bling] ${sku}: falha ao gravar espelho — ${espelhoErr.message}`);
        continue;
      }

      // F3 passo E: a edge NÃO grava mais origem_fisc (nem nenhum campo de cadastro)
      // em `sncf_produtos` — o espelho é cópia do FOP; a origem fiscal vai só ao Bling.

      criados.push({ sku, bling_id: String(blingId) });
      console.log(`[criar-produto-bling] ${sku}: criado no Bling (id ${blingId})`);
    }

    return json({
      ok: true,
      dry_run: false,
      criados,
      falhas,
      recusados,
    });
  } catch (e) {
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
