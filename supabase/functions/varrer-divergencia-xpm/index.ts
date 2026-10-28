// 20/10/2026 (Flavio): na_correcao decide o que a varredura compara; sobrescreve decide o que escreve
// 20/10/2026 (Flavio): varredura própria no molde do Bling; produto_campo_destino decide o que compara e sobrescreve decide o que escreve
// VARREDURA DE DIVERGÊNCIA SNCF × XPM (ZenLOG).
// modo "detectar" (padrão): só leitura (Produto/GetAll no próprio XPM), nada é escrito no XPM.
// modo "corrigir": PUT Produto/Update com o payload de fn_xpm_payload_cadastro (mesmo do
// atualizar_cadastro_xpm), trocando SÓ os campos com sobrescreve=true; o resto volta ao valor
// atual do XPM. Depois do PUT relê o produto e confere campo a campo (200 OK não prova gravação).
// Universo = vw_produto_conciliacao com xpm_codigo. Pagina e se re-encadeia no mesmo lote_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { difere, num, txt, vazio } from "../_shared/bling/montar-valores-produto.ts";
import { mapaCodigoExterno, exigirCodigoExterno } from "../_shared/produto-codigo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const PAGINA = 150;
const PAGINA_CORRIGIR = 40;
const SISTEMA = "XPM";
const FN = "varrer-divergencia-xpm";
const SLUG = "acao.varrer_xpm";

// deno-lint-ignore no-explicit-any
type Any = any;

const soDig = (v: unknown) => (vazio(v) ? null : String(v).replace(/\D/g, "") || null);
/** EAN: só dígitos, completado a 13 com zeros à esquerda. */
const eanNorm = (v: unknown) => { const d = soDig(v); return d && d.length <= 13 ? d.padStart(13, "0") : d; };
const up = (v: unknown) => txt(v).toUpperCase() || null;
/** Peso/medida 0 na matriz = sem valor (guarda de matriz incompleta: nunca vai ao XPM). */
// Como no Bling: em peso/medida, 0 e vazio são equivalentes.
const OPCIONAIS_ZERO_VAZIO = new Set(["peso_g", "altura_cm", "largura_cm", "profundidade_cm"]);
const zeroOuVazio = (v: unknown) => vazio(v) || Number(v) === 0;
const positivo = (v: unknown) => { const n = num(v); return n !== null && n > 0 ? n : null; };

type Ctx = { p1: Any; p2: Any; codCat: Map<string, string> };
type Extrator = {
  tipo: "txt" | "num";
  sncf: (c: Ctx) => unknown;
  xpm: (item: Any) => unknown;
  /** Campo do Produto/Update que recebe o valor (ausente = não gravável por este PUT). */
  put?: string;
};

/** Um extrator por produto_campo_destino.campo (sistema XPM). */
const EXTRATORES: Record<string, Extrator[]> = {
  nome_operacional: [
    { tipo: "txt", sncf: (c) => c.p1?.descricao, xpm: (i) => i.descricao, put: "descricao" },
    { tipo: "txt", sncf: (c) => c.p1?.descricaoReduzida, xpm: (i) => i.descricaoReduzida, put: "descricaoReduzida" },
  ],
  ncm: [{ tipo: "txt", sncf: (c) => soDig(c.p1?.classificacaoFiscalNCM), xpm: (i) => soDig(i.classificacaoFiscalNCM), put: "classificacaoFiscalNCM" }],
  peso_g: [
    { tipo: "num", sncf: (c) => positivo(c.p1?.pesoUnitario), xpm: (i) => i.pesoUnitario, put: "pesoUnitario" },
    { tipo: "num", sncf: (c) => positivo(c.p2?.pesoBruto), xpm: (i) => i.produtoSKU?.pesoBruto },
  ],
  altura_cm: [{ tipo: "num", sncf: (c) => positivo(c.p1?.altura), xpm: (i) => i.altura, put: "altura" }],
  largura_cm: [{ tipo: "num", sncf: (c) => positivo(c.p1?.largura), xpm: (i) => i.largura, put: "largura" }],
  profundidade_cm: [{ tipo: "num", sncf: (c) => positivo(c.p1?.comprimento), xpm: (i) => i.comprimento, put: "comprimento" }],
  ean: [{ tipo: "txt", sncf: (c) => eanNorm(c.p2?.codigo), xpm: (i) => eanNorm(i.produtoSKU?.codigo) }],
  grupo: [{
    tipo: "txt",
    sncf: (c) => (vazio(c.p1?.categoriaId) ? null : c.codCat.get(String(c.p1.categoriaId)) ?? `id ${c.p1.categoriaId}`),
    xpm: (i) => i.categoria?.codigo ?? null, put: "categoriaId",
  }],
  sku: [
    { tipo: "txt", sncf: (c) => up(c.p1?.codigo), xpm: (i) => up(i.codigo) },
    { tipo: "txt", sncf: (c) => up(c.p2?.codigoProduto), xpm: (i) => up(i.produtoSKU?.produto?.codigo) },
  ],
  tipo_embalagem: [{ tipo: "txt", sncf: (c) => c.p2?.descricao, xpm: (i) => i.produtoSKU?.descricao }],
};
/** Valor atual do XPM para cada campo do PUT (o que não é sobrescrito volta igual). */
const ATUAL_NO_PUT: Record<string, (i: Any) => unknown> = {
  descricao: (i) => i.descricao, descricaoReduzida: (i) => i.descricaoReduzida,
  classificacaoFiscalNCM: (i) => i.classificacaoFiscalNCM, categoriaId: (i) => i.categoriaId ?? i.categoria?.id,
  pesoUnitario: (i) => i.pesoUnitario, altura: (i) => i.altura, largura: (i) => i.largura, comprimento: (i) => i.comprimento,
};

async function clienteXpm(sb: Any) {
  const { data: cfgRow, error: eCfg } = await sb.from("integracoes_config").select("config").eq("sistema", "zenlog_prd").single();
  if (eCfg) throw new Error(`config zenlog_prd: ${eCfg.message}`);
  const cfg = (cfgRow?.config ?? {}) as Record<string, string>;
  if (!cfg.base_url) throw new Error("base_url ausente na config zenlog_prd");
  const { data: pat, error: ePat } = await sb.rpc("get_vault_secret", { p_name: cfg.pat_vault_key });
  if (ePat) throw new Error(`vault: ${ePat.message}`);
  if (!pat) throw new Error("PAT ausente no vault");
  const base = cfg.base_url;
  const authRes = await fetch(`${base}${cfg.auth_endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ personalAccessToken: pat, tenantName: cfg.tenant_name }),
  });
  const authJson = await authRes.json().catch(() => ({}));
  const token = authJson?.result?.accessToken;
  if (!authRes.ok || !token) throw new Error(`auth XPM falhou: ${authJson?.error?.message ?? authRes.status}`);
  const h = { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" };

  /** Catálogo inteiro do XPM, codigo (maiúsculo) → item. */
  async function catalogo(): Promise<Map<string, Any>> {
    const mapa = new Map<string, Any>();
    const take = 350;
    for (let skip = 0, total = Infinity, p = 0; skip < total && p < 20; p++) {
      if (p > 0) await sleep(THROTTLE_MS);
      const r = await fetch(`${base}/api/services/app/Produto/GetAll?MaxResultCount=${take}&SkipCount=${skip}`, { headers: h });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(`Produto/GetAll SkipCount=${skip}: ${j?.error?.message ?? r.status}`);
      total = j?.result?.totalCount ?? 0;
      const items: Any[] = j?.result?.items ?? [];
      if (!items.length) break;
      for (const it of items) { const k = up(it.codigo); if (k) mapa.set(k, it); }
      skip += items.length;
    }
    return mapa;
  }
  async function ler(id: number): Promise<Any> {
    const r = await fetch(`${base}/api/services/app/Produto/Get?Id=${id}`, { headers: h });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.success === false || !j?.result?.id) throw new Error(`Produto/Get ${id}: ${j?.error?.message ?? `HTTP ${r.status}`}`);
    return j.result;
  }
  async function atualizar(corpo: Any): Promise<void> {
    const r = await fetch(`${base}/api/services/app/Produto/Update`, { method: "PUT", headers: h, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!(r.ok && j?.success !== false)) throw new Error(`XPM PUT ${r.status}: ${j?.error?.message ?? JSON.stringify(j).slice(0, 400)}`);
  }
  return { catalogo, ler, atualizar };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Porta dupla: cron/encadeamento com x-cron-secret OU usuário com tem_permissao(SLUG).
  const { data: esperado, error: segErr } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  if (segErr || !esperado) return json(500, { error: `Não foi possível ler o SYNC_CRON_SECRET: ${segErr?.message ?? "vazio"}` });
  const segredo: string = esperado;
  const segredoRecebido = req.headers.get("x-cron-secret");
  if (segredoRecebido) {
    if (segredoRecebido !== esperado) return json(401, { error: "x-cron-secret inválido." });
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(403, { error: "Sem x-cron-secret e sem sessão." });
    const { data: u, error: uErr } = await sb.auth.getUser(auth.slice(7).trim());
    if (uErr || !u?.user) return json(403, { error: "Sessão inválida." });
    const { data: pode, error: pErr } = await sb.rpc("tem_permissao", { p_slug: SLUG, p_user: u.user.id });
    if (pErr) return json(500, { error: `Falha ao avaliar ${SLUG}: ${pErr.message}` });
    if (pode !== true) return json(403, { error: `Sem permissão (${SLUG}).` });
  }

  // Disparo pela tela: cria o lote e entrega o trabalho a uma chamada de fundo.
  if (!segredoRecebido) {
    try {
      let b: Any = {};
      try { b = await req.json(); } catch { b = {}; }
      const modoT = b?.modo === "corrigir" ? "corrigir" : "detectar";
      const dryT = modoT === "corrigir" && b?.dry_run === true;
      const novoLote = crypto.randomUUID();
      const { error } = await sb.from("produto_destino_varredura").insert({
        lote_id: novoLote, sistema: SISTEMA, modo: modoT,
        produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0,
        detalhe_erros: modoT === "corrigir" ? { dry_run: dryT, corrigidos: 0, planejados: 0, pulados: [], erros: [] } : [],
      });
      if (error) throw new Error(`criar lote: ${error.message}`);
      const fundo = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segredo },
        body: JSON.stringify({ lote_id: novoLote, modo: modoT, dry_run: dryT }),
      }).catch((e) => console.error("disparo de fundo falhou", novoLote, e));
      (globalThis as Any).EdgeRuntime?.waitUntil?.(fundo);
      return json(202, { ok: true, lote_id: novoLote, modo: modoT, dry_run: dryT, concluido: false });
    } catch (e) {
      return json(500, { ok: false, lote_id: null, error: e instanceof Error ? e.message : String(e) });
    }
  }

  try {
    let body: Any = {};
    try { body = await req.json(); } catch { body = {}; }
    const skus: string[] = Array.isArray(body?.skus)
      ? [...new Set<string>(body.skus.map((s: unknown) => String(s).trim()).filter(Boolean))] : [];
    const limiteN = Number(body?.limite);
    const limite = Number.isFinite(limiteN) && limiteN > 0 ? Math.floor(limiteN) : null;
    const cursor: string | null = typeof body?.cursor === "string" ? body.cursor : null;
    let loteId: string | null = typeof body?.lote_id === "string" ? body.lote_id : null;
    const modo: "detectar" | "corrigir" = body?.modo === "corrigir" ? "corrigir" : "detectar";
    const corrigir = modo === "corrigir";
    const dryRun = corrigir && body?.dry_run === true;
    const pulados: Any[] = [];
    const planejado: Any[] = [];
    const detalheErros: Any[] = [];

    if (!loteId) {
      loteId = crypto.randomUUID();
      const { error } = await sb.from("produto_destino_varredura").insert({
        lote_id: loteId, sistema: SISTEMA, modo,
        produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0,
        detalhe_erros: corrigir ? { dry_run: dryRun, corrigidos: 0, planejados: 0, pulados: [], erros: [] } : [],
      });
      if (error) throw new Error(`criar lote: ${error.message}`);
    }

    // ---- de-para: o banco decide o que compara (ativo) e o que escreve (sobrescreve) ----
    const { data: dePara, error: dpErr } = await sb.from("produto_campo_destino")
      .select("campo, campo_destino, sobrescreve, na_correcao, conversao").eq("sistema", SISTEMA).eq("ativo", true).eq("na_correcao", true);
    if (dpErr) throw new Error(`produto_campo_destino: ${dpErr.message}`);
    const campos = (dePara ?? []).filter((d: Any) => {
      if (EXTRATORES[d.campo]) return true;
      if (!cursor && !corrigir) detalheErros.push({ sku: null, mensagem: `campo sem extrator: ${d.campo}` });
      return false;
    });

    const pag = corrigir ? PAGINA_CORRIGIR : PAGINA;
    const tamanho = limite === null ? pag : Math.min(pag, limite);
    let q = sb.from("vw_produto_conciliacao").select("sku, cod_cadastro, xpm_codigo")
      .not("xpm_codigo", "is", null).order("sku").limit(tamanho);
    if (skus.length) q = q.in("sku", skus);
    if (cursor) q = q.gt("sku", cursor);
    const { data: universo, error: uErr } = await q;
    if (uErr) throw new Error(`vw_produto_conciliacao: ${uErr.message}`);
    const linhas = universo ?? [];
    const codigosExternos = await mapaCodigoExterno(sb, linhas.map((l: Any) => String(l.sku)));

    let lidos = 0, comDiv = 0, divs = 0, erros = 0;
    if (linhas.length) {
      const { data: catMap, error: eCat } = await sb.from("xpm_categoria_map").select("categoria_codigo, categoria_id");
      if (eCat) throw new Error(`xpm_categoria_map: ${eCat.message}`);
      const codCat = new Map<string, string>((catMap ?? []).map((c: Any) => [String(c.categoria_id), String(c.categoria_codigo)]));
      const xpm = await clienteXpm(sb);
      const catalogo = await xpm.catalogo();

      for (const l of linhas as Any[]) {
        lidos++;
        try {
          const codigoExterno = exigirCodigoExterno(l.sku, codigosExternos.get(l.sku));
          const item = catalogo.get(up(codigoExterno) ?? "");
          if (!item?.id) throw new Error(`código ${codigoExterno} (SKU ${l.sku}) não encontrado no XPM (Produto/GetAll)`);
          const { data: pay, error: ePay } = await sb.rpc("fn_xpm_payload_cadastro", { p_sku: l.sku });
          if (ePay) throw new Error(`fn_xpm_payload_cadastro: ${ePay.message}`);
          const p1 = pay?.passo_1_produto, p2 = pay?.passo_2_produto_sku;
          if (!p1) throw new Error("fn_xpm_payload_cadastro sem passo_1_produto");
          const ctx: Ctx = { p1, p2, codCat };
          const impeditivos = (Array.isArray(pay?.bloqueios) ? pay.bloqueios : []).map(String).filter((b: string) => !/JA CADASTRADO/i.test(b));

          const novas: Any[] = [];
          const corpo: Any = corrigir ? { ...p1, id: item.id } : null;
          const escritos: { linha: Any; ex: Extrator }[] = [];
          if (corpo) for (const [k, f] of Object.entries(ATUAL_NO_PUT)) corpo[k] = f(item); // parte do XPM atual
          for (const d of campos) {
            const exts = EXTRATORES[d.campo];
            exts.forEach((ex, k) => {
              const vs = ex.sncf(ctx), vx = ex.xpm(item);
              if (OPCIONAIS_ZERO_VAZIO.has(d.campo) && zeroOuVazio(vs) && zeroOuVazio(vx)) return;
              if (!difere(ex.tipo, vs, vx)) return;
              const partes = txt(d.campo_destino).split("+").map((s) => s.trim());
              const linha = {
                lote_id: loteId, sistema: SISTEMA, cod_cadastro: l.cod_cadastro, sku: l.sku,
                destino_id: String(item.id), campo: d.campo,
                campo_destino: exts.length > 1 ? partes[k] ?? d.campo_destino : d.campo_destino,
                valor_sncf: vazio(vs) ? null : txt(vs), valor_destino: vazio(vx) ? null : txt(vx),
              };
              if (!corrigir) { novas.push(linha); return; }
              if (d.sobrescreve !== true) return;
              if (impeditivos.length) { pulados.push({ sku: l.sku, campo: d.campo, motivo: `matriz incompleta: ${impeditivos.join("; ")}` }); return; }
              if (linha.valor_sncf === null) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "SNCF vazio (peso/medida 0 nunca vai ao XPM)" }); return; }
              if (!ex.put) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "sem regra de escrita no Produto/Update (campo do ProdutoSKU)" }); return; }
              corpo[ex.put] = ex.put === "categoriaId" ? p1.categoriaId : ex.put === "classificacaoFiscalNCM" ? p1.classificacaoFiscalNCM : (ex.tipo === "num" ? num(vs) : txt(vs));
              escritos.push({ linha, ex });
              novas.push(linha);
            });
          }
          if (corrigir && novas.length) {
            if (dryRun) {
              for (const n of novas) planejado.push({ sku: l.sku, campo: n.campo, de: n.valor_destino, para: n.valor_sncf });
            } else {
              await sleep(THROTTLE_MS);
              await xpm.atualizar(corpo);
              await sleep(THROTTLE_MS);
              // Regra "200 OK não prova gravação": relê e confere campo a campo.
              const relido = await xpm.ler(item.id);
              const falhou = escritos.filter(({ ex }) => difere(ex.tipo, ex.sncf(ctx), ex.xpm(relido)));
              if (falhou.length) throw new Error(`PUT aceito mas não gravou: ${falhou.map((f) => `${f.linha.campo_destino} (XPM ficou "${txt(f.ex.xpm(relido))}")`).join(", ")}`);
              const { error } = await sb.from("produto_destino_divergencia").insert(novas);
              if (error) throw new Error(`gravar sobrescrita: ${error.message}`);
              console.log(`[${FN}] corrigido ${l.sku}: ${novas.map((n) => n.campo_destino).join(", ")}`);
            }
            comDiv++; divs += novas.length;
          } else if (novas.length) {
            const { error } = await sb.from("produto_destino_divergencia").insert(novas);
            if (error) throw new Error(`gravar divergência: ${error.message}`);
            comDiv++; divs += novas.length;
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("gravar ")) throw e;
          erros++;
          detalheErros.push({ sku: l.sku, mensagem: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    // ---- acumula no lote ----
    const { data: lote, error: lErr } = await sb.from("produto_destino_varredura").select("*").eq("lote_id", loteId).single();
    if (lErr) throw new Error(`ler lote: ${lErr.message}`);
    const restante = limite === null ? null : limite - linhas.length;
    const acabou = linhas.length < tamanho || (restante !== null && restante <= 0);
    let detalhe: Any;
    if (corrigir) {
      const ant: Any = lote.detalhe_erros && !Array.isArray(lote.detalhe_erros) ? lote.detalhe_erros : {};
      detalhe = {
        dry_run: dryRun,
        corrigidos: (ant.corrigidos ?? 0) + (dryRun ? 0 : divs),
        planejados: (ant.planejados ?? 0) + (dryRun ? divs : 0),
        pulados: [...(ant.pulados ?? []), ...pulados],
        erros: [...(ant.erros ?? []), ...detalheErros],
      };
    } else {
      detalhe = [...(lote.detalhe_erros ?? []), ...detalheErros];
    }
    const patch: Any = {
      produtos_lidos: (lote.produtos_lidos ?? 0) + lidos,
      produtos_com_divergencia: (lote.produtos_com_divergencia ?? 0) + comDiv,
      divergencias: (lote.divergencias ?? 0) + divs,
      erros: (lote.erros ?? 0) + erros,
      detalhe_erros: detalhe,
    };
    if (acabou) patch.concluido_em = new Date().toISOString();
    const { error: upErr } = await sb.from("produto_destino_varredura").update(patch).eq("lote_id", loteId);
    if (upErr) throw new Error(`atualizar lote: ${upErr.message}`);

    if (!acabou) {
      const prox = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${FN}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segredo },
        body: JSON.stringify({ lote_id: loteId, cursor: (linhas[linhas.length - 1] as Any).sku, limite: restante, skus: skus.length ? skus : undefined, modo, dry_run: dryRun }),
      }).catch((e) => console.error("re-encadear falhou", loteId, e));
      (globalThis as Any).EdgeRuntime?.waitUntil?.(prox);
    }

    return json(200, {
      ok: true, lote_id: loteId, modo, dry_run: dryRun, concluido: acabou,
      pagina: { lidos, com_divergencia: comDiv, divergencias: divs, erros },
      ...(corrigir ? { planejado: dryRun ? planejado : undefined, pulados, erros_detalhe: detalheErros } : {}),
      lote: { ...lote, ...patch },
    });
  } catch (e) {
    return json(500, { ok: false, lote_id: null, error: e instanceof Error ? e.message : String(e) });
  }
});
