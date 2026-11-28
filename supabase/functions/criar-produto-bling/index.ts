// Nascimento de produto no Bling (POST /produtos v3).
// Mesmo padrão de `atualizar-nomes-bling`: auth por sessão + client Bling com refresh de token,
// throttle de 350ms, dry-run por padrão.
// Portões: ficha (vw_produto_ficha_pendencias), duplicidade (bling_produtos_cache) e validação do
// cadastro por destino (vw_produto_destino_pendencia, regras em produto_campo_destino.exigencia —
// nada de regra de campo escrita no código).
// Nunca assume origem fiscal: é decisão humana/contador.
// Repositório de Mídia · F3 (mapa-repositorio-midia-v1, 28/11/2026): com o campo fotos ativo e na_criacao em
// produto_campo_destino (Bling), as fotos de produto_midia vão em midia.imagens.imagensURL (campo de escrita da API v3); sem foto, o campo é omitido.

import { fotosEmLote } from "../_shared/bling/fotos-produto.ts";
import { resolverProdutoBling } from "../_shared/bling/resolver-produto.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { carregarFaseDestino, situacaoPelaFase, FaseSemRegra, grupoTributarioDaFicha, carregarGruposBling } from "../_shared/bling/montar-valores-produto.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { exigirCodigoExterno } from "../_shared/produto-codigo.ts";

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

    // ---- fichas: a prévia pode devolver o SKU real ou o codigo_externo ----
    const valorPostgrest = (valor: string) => `"${valor.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const listaIdentificadores = skus.map(valorPostgrest).join(",");
    const { data: fichas, error: fichaErr } = await supabase
      .from("sncf_produtos")
      .select("*")
      .or(`sku.in.(${listaIdentificadores}),codigo_externo.in.(${listaIdentificadores})`);
    if (fichaErr) return json({ ok: false, erro: `Falha ao ler sncf_produtos: ${fichaErr.message}` }, 500);
    const porSku = new Map<string, any>();
    const fichaPorIdentificador = new Map<string, any>();
    for (const f of fichas || []) {
      porSku.set(f.sku, f);
      const codigoExterno = String(f.codigo_externo ?? "").trim().toLowerCase();
      if (codigoExterno) fichaPorIdentificador.set(codigoExterno, f);
    }
    // O SKU exato tem precedência se coincidir com o código externo de outra ficha.
    for (const f of fichas || []) fichaPorIdentificador.set(f.sku, f);

    const recusados: { sku: string; motivo: string }[] = [];
    const skusReais: string[] = [];
    const skusVistos = new Set<string>();
    for (const identificador of skus) {
      const ficha = fichaPorIdentificador.get(identificador) ?? fichaPorIdentificador.get(identificador.toLowerCase());
      if (!ficha) {
        recusados.push({ sku: identificador, motivo: "não encontrado em sncf_produtos" });
        console.log(`[criar-produto-bling] ${identificador}: recusado — sem ficha`);
        continue;
      }
      if (!skusVistos.has(ficha.sku)) {
        skusVistos.add(ficha.sku);
        skusReais.push(ficha.sku);
      }
    }
    skus = skusReais;

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
      .in("sku", [...new Set((fichas ?? []).map((f: any) => String(f.codigo_externo ?? "").trim()).filter(Boolean))]);
    if (cacheErr) return json({ ok: false, erro: `Falha ao ler bling_produtos_cache: ${cacheErr.message}` }, 500);
    // codigo do Bling -> bling_id (cache). Na transição o card pode ter o SKU antigo: a RPC resolve.
    const cachePorCodigo = new Map<string, string>((cache || []).map((c: any) => [c.sku, String(c.bling_produto_id ?? "")]));
    const codigoPorBlingId = new Map<string, string>((cache || []).filter((c: any) => c.bling_produto_id).map((c: any) => [String(c.bling_produto_id), c.sku]));
    const jaExiste = new Map<string, { id: string; codigo: string }>();
    for (const f of (fichas ?? []) as any[]) {
      const cod = String(f.codigo_externo ?? "").trim();
      if (!cod) continue;
      let r;
      try { r = await resolverProdutoBling(supabase, cod); }
      catch (e) { return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500); }
      if (r.bling_id && (r.ok || r.card_inativo)) {
        jaExiste.set(cod, { id: String(r.bling_id), codigo: codigoPorBlingId.get(String(r.bling_id)) ?? r.sku ?? cod });
      } else if (cachePorCodigo.has(cod)) {
        jaExiste.set(cod, { id: cachePorCodigo.get(cod) || "?", codigo: cod });
      }
    }
    if (jaExiste.size) {
      // Código atual do card no Bling (pode ser o SKU antigo) pelo id, para a mensagem.
      const ids = [...jaExiste.values()].map((v) => Number(v.id)).filter((n) => Number.isFinite(n));
      if (ids.length) {
        const { data: porId, error: porIdErr } = await supabase
          .from("bling_produtos_cache").select("sku, bling_produto_id").in("bling_produto_id", ids);
        if (porIdErr) return json({ ok: false, erro: `Falha ao ler bling_produtos_cache: ${porIdErr.message}` }, 500);
        const m = new Map<string, string>((porId ?? []).map((c: any) => [String(c.bling_produto_id), c.sku]));
        for (const v of jaExiste.values()) if (m.has(v.id)) v.codigo = m.get(v.id)!;
      }
    }

    // ---- PORTÃO 3: validação do cadastro por destino (regras em produto_campo_destino.exigencia) ----
    const { data: destPend, error: destPendErr } = await supabase
      .from("vw_produto_destino_pendencia")
      .select("sku, pendencia")
      .eq("sistema", "Bling")
      .eq("nivel", "trava")
      .in("sku", skus);
    if (destPendErr) return json({ ok: false, erro: `Falha ao ler vw_produto_destino_pendencia: ${destPendErr.message}` }, 500);
    const destPendPorSku = new Map<string, string[]>();
    for (const r of (destPend || []) as any[]) {
      const lista = destPendPorSku.get(r.sku) ?? [];
      if (r.pendencia && !lista.includes(r.pendencia)) lista.push(r.pendencia);
      destPendPorSku.set(r.sku, lista);
    }

    const criar: { sku: string; payload: any; grupo: string }[] = [];


    const faseDestino = await carregarFaseDestino(supabase, "Bling");
    const { data: campoFotos, error: campoFotosErr } = await supabase.from("produto_campo_destino")
      .select("campo").eq("sistema", "Bling").eq("campo", "fotos").eq("ativo", true).eq("na_criacao", true).maybeSingle();
    if (campoFotosErr) return json({ ok: false, erro: `Falha ao ler produto_campo_destino (fotos): ${campoFotosErr.message}` }, 500);
    const fotosPorCod = campoFotos
      ? await fotosEmLote(supabase as any, skus.map((s) => porSku.get(s)?.cod_cadastro).filter(Boolean))
      : new Map<string, string[]>();
    for (const sku of skus) {
      const f = porSku.get(sku);
      if (!f) {
        recusados.push({ sku, motivo: "não encontrado em sncf_produtos" });
        console.log(`[criar-produto-bling] ${sku}: recusado — sem ficha`);
        continue;
      }
      // SKU É SÓ INTERNO: o código no Bling é o codigo_externo.
      let codigoExterno: string;
      try { codigoExterno = exigirCodigoExterno(sku, f.codigo_externo); }
      catch (e) { recusados.push({ sku, motivo: (e as Error).message }); continue; }
      const existente = jaExiste.get(codigoExterno);
      if (existente) {
        const motivo = `já tem card no Bling (id ${existente.id}, código ${existente.codigo}) — use Corrigir no Bling`;
        recusados.push({ sku, motivo });
        console.log(`[criar-produto-bling] ${sku}: recusado — ${motivo}`);
        continue;
      }
      const faltando = pendPorSku.get(sku);
      if (faltando && faltando.length > 0) {
        recusados.push({ sku, motivo: `ficha pendente: ${faltando.join(", ")}` });
        console.log(`[criar-produto-bling] ${sku}: recusado — ficha pendente (${faltando.join(", ")})`);
        continue;
      }
      const pendCadastro = destPendPorSku.get(sku);
      if (pendCadastro && pendCadastro.length > 0) {
        recusados.push({ sku, motivo: `pendência de cadastro: ${pendCadastro.join(", ")}` });
        console.log(`[criar-produto-bling] ${sku}: recusado — pendência de cadastro (${pendCadastro.join(", ")})`);
        continue;
      }
      const nome = texto(f.nome_operacional);
      if (!nome) {
        recusados.push({ sku, motivo: "nome_operacional vazio" });
        console.log(`[criar-produto-bling] ${sku}: recusado — nome_operacional vazio`);
        continue;
      }
      let situacaoCard: string;
      try { situacaoCard = situacaoPelaFase(faseDestino, f.fase); } catch (e) {
        if (!(e instanceof FaseSemRegra)) throw e;
        recusados.push({ sku, motivo: e.message });
        continue;
      }
      // 20/10/2026: grupo tributário é campo próprio (bloco 1), não derivado
      const grupo = grupoTributarioDaFicha(f.grupo_tributario_bling, origemFiscal ?? f.origem_fisc);
      if (!grupo) {
        recusados.push({ sku, motivo: "sem grupo tributário (grupo_tributario_bling e origem vazios)" });
        continue;
      }
      const pesoKg = num(f.peso_g) !== null ? Number(f.peso_g) / 1000 : null;
      const payload: any = {
        nome,
        codigo: codigoExterno,
        tipo: "P",
        formato: "S",
        situacao: situacaoCard, // situação da fase via produto_fase_destino (15/10)
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
      const fotos = fotosPorCod.get(f.cod_cadastro) ?? [];
      if (fotos.length) payload.midia = { imagens: { imagensURL: fotos.map((link) => ({ link })) } };
      criar.push({ sku, payload, grupo });
    }

    if (!executar) {
      console.log(`[criar-produto-bling] dry-run: ${criar.length} a criar, ${recusados.length} recusados`);
      return json({
        ok: true,
        dry_run: true,
        criar: criar.map((c) => ({ sku: c.sku, ...c.payload, grupo_tributario: c.grupo })),
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

    let gruposBling: Map<string, number>;
    try {
      gruposBling = (await carregarGruposBling(client, THROTTLE_MS)).idPorNome;
    } catch (e) {
      return json({ ok: false, erro: `Falha ao ler /grupos-produtos do Bling: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }
    const semGrupo = [...new Set(criar.map((c) => c.grupo).filter((g) => !gruposBling.has(g.toLowerCase())))];
    if (semGrupo.length) {
      return json({ ok: false, erro: `Grupo tributário não existe no Bling: ${semGrupo.join(", ")}. Nenhum card criado.`, recusados }, 409);
    }
    for (const c of criar) {
      c.payload.tributacao = { ...c.payload.tributacao, grupoProduto: { id: gruposBling.get(c.grupo.toLowerCase()) } };
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
            sku: payload.codigo,
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
            codigo: payload.codigo,
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
