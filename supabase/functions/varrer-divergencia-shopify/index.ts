// 20/10/2026 (Flavio): na_correcao decide o que a varredura compara; sobrescreve decide o que escreve
// 20/10/2026 (Flavio): varredura própria no molde do Bling; produto_campo_destino decide o que compara e sobrescreve decide o que escreve
// VARREDURA DE DIVERGÊNCIA SNCF × SHOPIFY (Admin API GraphQL).
// modo "detectar" (padrão): só leitura (produto + variante pelo SKU, metafields), nada escrito.
// modo "corrigir": productVariantsBulkUpdate / productUpdate / metafieldsSet SÓ dos campos com
// sobrescreve=true. Depois relê a variante e confere campo a campo (200 OK não prova gravação).
// Universo = vw_produto_conciliacao com handle no espelho. Kits (Bundles) ficam fora, como na fila.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { makeShopifyAdmin } from "../_shared/shopify/admin-client.ts";
import { FaseSemRegra, carregarFaseDestino, difere, num, situacaoPelaFase, txt, vazio, type MapaFaseDestino } from "../_shared/bling/montar-valores-produto.ts";
import { exigirCodigoExterno } from "../_shared/produto-codigo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const PAGINA = 120;
const PAGINA_CORRIGIR = 40;
const SISTEMA = "Shopify";
const FN = "varrer-divergencia-shopify";
const SLUG = "acao.varrer_shopify";

// deno-lint-ignore no-explicit-any
type Any = any;

const soDig = (v: unknown) => (vazio(v) ? null : String(v).replace(/\D/g, "") || null);
const eanNorm = (v: unknown) => { const d = soDig(v); return d && d.length <= 13 ? d.padStart(13, "0") : d; };
const up = (v: unknown) => txt(v).toUpperCase() || null;
// Como no Bling: em peso/medida, 0 e vazio são equivalentes.
const OPCIONAIS_ZERO_VAZIO = new Set(["peso_g", "altura_cm", "largura_cm", "profundidade_cm"]);
const zeroOuVazio = (v: unknown) => vazio(v) || Number(v) === 0;
const FATOR_G: Record<string, number> = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.349523125, POUNDS: 453.59237 };
const pesoG = (v: Any) => {
  const w = v?.inventoryItem?.measurement?.weight;
  if (!w || w.value === null || FATOR_G[w.unit] === undefined) return null;
  return Math.round(Number(w.value) * FATOR_G[w.unit]);
};
const semHtml = (v: unknown) => (vazio(v) ? null : String(v).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim() || null);
const mf = (p: Any, alias: string) => p?.[alias]?.value ?? null;

const METAFIELDS: Record<string, [string, string]> = {
  mf_produto: ["custom", "produto"], mf_material: ["custom", "material"], mf_marca: ["custom", "marca"],
  mf_nome: ["custom", "nome_produto"], mf_tipo: ["custom", "tipo_produto"], mf_linha: ["custom", "linha"],
  mf_colecao: ["custom", "colecao"], mf_altura: ["meucorreios", "altura"], mf_largura: ["meucorreios", "largura"],
  mf_comprimento: ["meucorreios", "comprimento"],
};
const MF_GQL = Object.entries(METAFIELDS).map(([a, [ns, k]]) => `${a}: metafield(namespace: "${ns}", key: "${k}") { value type }`).join("\n");
const Q_VAR = `query($q: String!) {
  productVariants(first: 10, query: $q) {
    nodes {
      id sku barcode price
      inventoryItem { id measurement { weight { unit value } } }
      product { id handle title status vendor productType descriptionHtml hasVariantsThatRequiresComponents
        ${MF_GQL}
      }
    }
  }
}`;
const M_VAR = `mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $p, variants: $v) { productVariants { id } userErrors { field message } }
}`;
const M_PROD = `mutation($input: ProductUpdateInput!) {
  productUpdate(product: $input) { product { id } userErrors { field message } }
}`;
const M_MF = `mutation($m: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $m) { metafields { id } userErrors { field message } }
}`;

type Ctx = { ficha: Any; fase: string | null; faseDestino: MapaFaseDestino };
/** Como gravar: variante (price/barcode), inventoryItem (sku/peso), produto (campo) ou metafield (alias). */
type Escrita = { variante?: string; inv?: "sku" | "peso"; produto?: string; mf?: string };
type Extrator = { tipo: "txt" | "num"; sncf: (c: Ctx) => unknown; shopify: (v: Any) => unknown; escrita?: Escrita };

/** Um extrator por produto_campo_destino.campo (sistema Shopify). */
const EXTRATORES: Record<string, Extrator[]> = {
  sku: [{ tipo: "txt", sncf: (c) => up(exigirCodigoExterno(c.ficha.sku, c.ficha.codigo_externo)), shopify: (v) => up(v.sku), escrita: { inv: "sku" } }],
  ean: [{ tipo: "txt", sncf: (c) => eanNorm(c.ficha.ean), shopify: (v) => eanNorm(v.barcode), escrita: { variante: "barcode" } }],
  preco_site: [{ tipo: "num", sncf: (c) => num(c.ficha.preco_site), shopify: (v) => num(v.price), escrita: { variante: "price" } }],
  peso_g: [{ tipo: "num", sncf: (c) => num(c.ficha.peso_g), shopify: pesoG, escrita: { inv: "peso" } }],
  altura_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.altura_cm), shopify: (v) => num(mf(v.product, "mf_altura")), escrita: { mf: "mf_altura" } }],
  largura_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.largura_cm), shopify: (v) => num(mf(v.product, "mf_largura")), escrita: { mf: "mf_largura" } }],
  profundidade_cm: [{ tipo: "num", sncf: (c) => num(c.ficha.profundidade_cm), shopify: (v) => num(mf(v.product, "mf_comprimento")), escrita: { mf: "mf_comprimento" } }],
  cod_cadastro: [{ tipo: "txt", sncf: (c) => c.ficha.cod_cadastro, shopify: (v) => mf(v.product, "mf_produto"), escrita: { mf: "mf_produto" } }],
  material: [{ tipo: "txt", sncf: (c) => c.ficha.material, shopify: (v) => mf(v.product, "mf_material"), escrita: { mf: "mf_material" } }],
  linha: [{ tipo: "txt", sncf: (c) => c.ficha.linha, shopify: (v) => mf(v.product, "mf_linha"), escrita: { mf: "mf_linha" } }],
  colecao: [{ tipo: "txt", sncf: (c) => c.ficha.colecao, shopify: (v) => mf(v.product, "mf_colecao"), escrita: { mf: "mf_colecao" } }],
  marca: [
    { tipo: "txt", sncf: (c) => c.ficha.marca, shopify: (v) => v.product?.vendor, escrita: { produto: "vendor" } },
    { tipo: "txt", sncf: (c) => c.ficha.marca, shopify: (v) => mf(v.product, "mf_marca"), escrita: { mf: "mf_marca" } },
  ],
  nome_comercial: [
    { tipo: "txt", sncf: (c) => c.ficha.nome_comercial, shopify: (v) => v.product?.title, escrita: { produto: "title" } },
    { tipo: "txt", sncf: (c) => c.ficha.nome_comercial, shopify: (v) => mf(v.product, "mf_nome"), escrita: { mf: "mf_nome" } },
  ],
  grupo: [
    { tipo: "txt", sncf: (c) => c.ficha.grupo, shopify: (v) => v.product?.productType, escrita: { produto: "productType" } },
    { tipo: "txt", sncf: (c) => c.ficha.grupo, shopify: (v) => mf(v.product, "mf_tipo"), escrita: { mf: "mf_tipo" } },
  ],
  descricao_produto: [{ tipo: "txt", sncf: (c) => semHtml(c.ficha.descricao_produto), shopify: (v) => semHtml(v.product?.descriptionHtml) }],
  fase: [{ tipo: "txt", sncf: (c) => situacaoPelaFase(c.faseDestino, c.fase), shopify: (v) => v.product?.status, escrita: { produto: "status" } }],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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
    let kits = 0;

    if (!loteId) {
      loteId = crypto.randomUUID();
      const { error } = await sb.from("produto_destino_varredura").insert({
        lote_id: loteId, sistema: SISTEMA, modo,
        produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0,
        detalhe_erros: corrigir ? { dry_run: dryRun, corrigidos: 0, planejados: 0, pulados: [], erros: [] } : [],
      });
      if (error) throw new Error(`criar lote: ${error.message}`);
    }

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
    let q = sb.from("vw_produto_conciliacao").select("sku, cod_cadastro, fase, handle")
      .not("handle", "is", null).order("sku").limit(tamanho);
    if (skus.length) q = q.in("sku", skus);
    if (cursor) q = q.gt("sku", cursor);
    const { data: universo, error: uErr } = await q;
    if (uErr) throw new Error(`vw_produto_conciliacao: ${uErr.message}`);
    const linhas = universo ?? [];

    let lidos = 0, comDiv = 0, divs = 0, erros = 0;
    if (linhas.length) {
      const { data: fichas, error: fErr } = await sb.from("sncf_produtos")
        .select("sku, codigo_externo, cod_cadastro, nome_comercial, preco_site, ean, peso_g, altura_cm, largura_cm, profundidade_cm, marca, material, linha, colecao, grupo, descricao_produto")
        .in("sku", linhas.map((l: Any) => l.sku));
      if (fErr) throw new Error(`sncf_produtos: ${fErr.message}`);
      const fichaPorSku = new Map((fichas ?? []).map((f: Any) => [f.sku, f]));
      const faseDestino = await carregarFaseDestino(sb, SISTEMA);
      const shop = await makeShopifyAdmin(sb);

      const lerVariante = async (sku: string, handle: string): Promise<Any | null> => {
        const r = await shop.gql<Any>(Q_VAR, { q: `sku:"${sku.replace(/"/g, '\\"')}"` });
        if (r.status !== 200 || r.errors) throw new Error(`consulta Shopify: ${JSON.stringify(r.errors ?? r.body).slice(0, 300)}`);
        const nodes: Any[] = r.data?.productVariants?.nodes ?? [];
        const doSku = nodes.filter((n) => up(n.sku) === up(sku));
        return doSku.find((n) => n.product?.handle === handle) ?? doSku[0] ?? null;
      };

      for (let i = 0; i < linhas.length; i++) {
        const l: Any = linhas[i];
        if (i > 0) await sleep(THROTTLE_MS);
        try {
          const ficha = fichaPorSku.get(l.sku);
          if (!ficha) throw new Error("sem ficha em sncf_produtos");
          const codigo_externo = exigirCodigoExterno(l.sku, ficha?.codigo_externo);
          const v = await lerVariante(codigo_externo, l.handle);
          if (!v) throw new Error(`variante com SKU ${l.sku} não encontrada no Shopify (handle ${l.handle})`);
          if (v.product?.hasVariantsThatRequiresComponents) { kits++; continue; } // kit (Bundles) fora
          lidos++;
          const ctx: Ctx = { ficha, fase: l.fase, faseDestino };
          const novas: Any[] = [];
          const escritos: { linha: Any; ex: Extrator }[] = [];
          const inputVar: Any = { id: v.id };
          const inputProd: Any = { id: v.product.id };
          const mfs: Any[] = [];
          for (const d of campos) {
            const exts = EXTRATORES[d.campo];
            exts.forEach((ex, k) => {
              let vs: unknown;
              try { vs = ex.sncf(ctx); } catch (e) {
                if (!(e instanceof FaseSemRegra)) throw e;
                if (corrigir) pulados.push({ sku: l.sku, campo: d.campo, motivo: e.message });
                else detalheErros.push({ sku: l.sku, campo: d.campo, mensagem: e.message });
                return;
              }
              const vx = ex.shopify(v);
              if (OPCIONAIS_ZERO_VAZIO.has(d.campo) && zeroOuVazio(vs) && zeroOuVazio(vx)) return;
              if (!difere(ex.tipo, vs, vx)) return;
              const partes = txt(d.campo_destino).split("+").map((s) => s.trim());
              const linha = {
                lote_id: loteId, sistema: SISTEMA, cod_cadastro: l.cod_cadastro, sku: l.sku,
                destino_id: String(v.id), campo: d.campo,
                campo_destino: exts.length > 1 ? partes[k] ?? d.campo_destino : d.campo_destino,
                valor_sncf: vazio(vs) ? null : txt(vs), valor_destino: vazio(vx) ? null : txt(vx),
              };
              if (!corrigir) { novas.push(linha); return; }
              if (d.sobrescreve !== true) return;
              if (linha.valor_sncf === null) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "SNCF vazio" }); return; }
              const e = ex.escrita;
              if (!e) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "sem regra de escrita no Shopify" }); return; }
              if (e.variante === "price") inputVar.price = Number(vs).toFixed(2);
              else if (e.variante) inputVar[e.variante] = txt(vs);
              else if (e.inv === "sku") inputVar.inventoryItem = { ...(inputVar.inventoryItem ?? {}), sku: txt(vs) };
              else if (e.inv === "peso") inputVar.inventoryItem = { ...(inputVar.inventoryItem ?? {}), measurement: { weight: { unit: "GRAMS", value: Number(vs) } } };
              else if (e.produto) inputProd[e.produto] = txt(vs);
              else if (e.mf) {
                const [ns, key] = METAFIELDS[e.mf];
                mfs.push({ ownerId: v.product.id, namespace: ns, key, type: v.product?.[e.mf]?.type ?? "single_line_text_field", value: txt(vs) });
              }
              escritos.push({ linha, ex });
              novas.push(linha);
            });
          }
          if (corrigir && novas.length) {
            if (dryRun) {
              for (const n of novas) planejado.push({ sku: l.sku, campo: n.campo, de: n.valor_destino, para: n.valor_sncf });
            } else {
              const checa = (r: Any, chave: string) => {
                const ue = r.data?.[chave]?.userErrors ?? [];
                if (r.status !== 200 || r.errors || ue.length) throw new Error(`${chave}: ${JSON.stringify(r.errors ?? ue).slice(0, 400)}`);
              };
              if (Object.keys(inputVar).length > 1) { await sleep(THROTTLE_MS); checa(await shop.gql<Any>(M_VAR, { p: v.product.id, v: [inputVar] }), "productVariantsBulkUpdate"); }
              if (Object.keys(inputProd).length > 1) { await sleep(THROTTLE_MS); checa(await shop.gql<Any>(M_PROD, { input: inputProd }), "productUpdate"); }
              if (mfs.length) { await sleep(THROTTLE_MS); checa(await shop.gql<Any>(M_MF, { m: mfs }), "metafieldsSet"); }
              // Regra "200 OK não prova gravação": relê e confere campo a campo.
              await sleep(THROTTLE_MS);
              const skuRelido = inputVar.inventoryItem?.sku ?? codigo_externo;
              const relido = await lerVariante(skuRelido, l.handle);
              if (!relido) throw new Error("gravou, mas a releitura não achou a variante");
              const falhou = escritos.filter(({ ex }) => difere(ex.tipo, ex.sncf(ctx), ex.shopify(relido)));
              if (falhou.length) throw new Error(`Shopify aceitou mas não gravou: ${falhou.map((f) => `${f.linha.campo_destino} (ficou "${txt(f.ex.shopify(relido))}")`).join(", ")}`);
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
          lidos++; erros++;
          detalheErros.push({ sku: l.sku, mensagem: e instanceof Error ? e.message : String(e) });
        }
      }
    }

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
        kits_fora: (ant.kits_fora ?? 0) + kits,
      };
    } else {
      detalhe = [...(lote.detalhe_erros ?? []), ...detalheErros];
      if (kits) detalhe.push({ sku: null, kits_fora: kits, mensagem: `${kits} kit(s) (Bundles) fora da varredura` });
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
      pagina: { lidos, com_divergencia: comDiv, divergencias: divs, erros, kits_fora: kits },
      ...(corrigir ? { planejado: dryRun ? planejado : undefined, pulados, erros_detalhe: detalheErros } : {}),
      lote: { ...lote, ...patch },
    });
  } catch (e) {
    return json(500, { ok: false, lote_id: null, error: e instanceof Error ? e.message : String(e) });
  }
});
