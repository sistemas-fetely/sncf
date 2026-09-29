// corrigir-produto-shopify — CORRIGIR NO SHOPIFY PELA MATRIZ (28/09/2026).
// Mapa: sncf_documentacao slug `mapa-corrigir-shopify-conciliacao-v1`. Irmã de corrigir-produto-bling.
// SISTEMA SUGERE / HUMANO DECIDE: dry_run é o default; só grava com dry_run explicitamente false.
// Campos = os da regra shopify_cadastro_difere: preço, EAN, SKU do anúncio, peso, marca. Título fora.
// Nunca cria anúncio. FAIL-LOUD por SKU + integracoes_sync_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { makeShopifyAdmin } from "../_shared/shopify/admin-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TETO = 50;
const ACAO = "acao.produto_corrigir_externo";
const TOL_PESO_G = 1;

// deno-lint-ignore no-explicit-any
type Linha = any;
type DePara = { campo: string; shopify: unknown; novo: unknown };
type Resultado = { sku: string; status: string; produto?: string; de_para?: DePara[]; erro?: string };

const Q_VAR = `query($q: String!) {
  productVariants(first: 5, query: $q) {
    nodes {
      id sku barcode price
      inventoryItem { id measurement { weight { unit value } } }
      product { id title vendor marca: metafield(namespace: "custom", key: "marca") { value } }
    }
  }
}`;
const M_VAR = `mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $p, variants: $v) { productVariants { id sku } userErrors { field message } }
}`;
const M_PROD = `mutation($input: ProductUpdateInput!) {
  productUpdate(product: $input) { product { id vendor } userErrors { field message } }
}`;

const FATOR_G: Record<string, number> = { GRAMS: 1, KILOGRAMS: 1000, OUNCES: 28.349523125, POUNDS: 453.59237 };
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const soDig = (v: unknown) => txt(v).replace(/\D/g, "");
const semZero = (v: unknown) => soDig(v).replace(/^0+/, "");
// Mesmo formato do pull (shopify-catalogo-pull): id numérico do GID como TEXTO ("123").
const idNumerico = (gid: unknown): string | null => {
  if (!gid) return null;
  const last = String(gid).split("/").pop() ?? "";
  return /^\d+$/.test(last) ? last : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
  const { data: u, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ ok: false, erro: "Não autorizado" }, 401);
  const userId = u.user.id;
  const { data: pode } = await supabase.rpc("usuario_tem_acao", { p_slug: ACAO, p_user_id: userId });
  if (!pode) return json({ ok: false, erro: `Sem permissão para esta ação (${ACAO}).` }, 403);

  let body: Linha = {};
  try { body = await req.json(); } catch { /* sem body */ }
  const skus: string[] = Array.isArray(body?.skus)
    ? [...new Set<string>(body.skus.map((s: unknown) => String(s).trim()).filter(Boolean))]
    : [];
  const dryRun = body?.dry_run === false ? false : true;
  if (!skus.length) return json({ ok: false, erro: "Informe ao menos um SKU em skus." }, 400);
  if (skus.length > TETO) return json({ ok: false, erro: `Teto de ${TETO} SKUs por chamada (recebido ${skus.length}).` }, 400);

  const resultados: Resultado[] = [];
  try {
    const { data: fichas, error: fErr } = await supabase
      .from("sncf_produtos").select("sku, preco_varejo, ean, peso_g, marca").in("sku", skus);
    if (fErr) return json({ ok: false, erro: `sncf_produtos: ${fErr.message}` }, 500);
    const porSku = new Map<string, Linha>((fichas ?? []).map((f: Linha) => [f.sku, f]));

    const shop = await makeShopifyAdmin(supabase);

    // Plano por SKU; marca é por produto (1x por produto na chamada).
    const planoVariantes = new Map<string, Linha[]>(); // productId -> inputs de variante
    const planoProduto = new Map<string, { vendor?: string; marca?: string }>();
    const skusPorProduto = new Map<string, string[]>();
    // Peso gravado no Shopify → espelho shopify_variante_peso (lido pela Conciliação).
    const pesoPlanejado = new Map<string, { produtoId: string; invId: string; peso_g: number }>();

    for (const sku of skus) {
      const f = porSku.get(sku);
      if (!f) { resultados.push({ sku, status: "sem_ficha_sncf" }); continue; }

      const termos = [`sku:"${sku.replace(/"/g, '\\"')}"`];
      const ean = soDig(f.ean);
      if (ean) { termos.push(`barcode:${ean}`); if (semZero(ean) !== ean) termos.push(`barcode:${semZero(ean)}`); }
      const q = await shop.gql<Linha>(Q_VAR, { q: termos.join(" OR ") });
      if (q.status !== 200 || q.errors) {
        resultados.push({ sku, status: "erro", erro: `consulta: ${JSON.stringify(q.errors ?? q.body).slice(0, 300)}` });
        continue;
      }
      const nodes: Linha[] = q.data?.productVariants?.nodes ?? [];
      const v = nodes.find((n) => txt(n.sku).toUpperCase() === sku.toUpperCase())
        ?? nodes.find((n) => ean && semZero(n.barcode) === semZero(ean));
      if (!v) { resultados.push({ sku, status: "sem_anuncio" }); continue; }

      const produtoId: string = v.product.id;
      const de_para: DePara[] = [];
      const inputVar: Linha = { id: v.id };
      const inv: Linha = {};

      // Preço
      const preco = f.preco_varejo === null || f.preco_varejo === undefined ? null : Number(f.preco_varejo);
      if (preco !== null && Number.isFinite(preco) && preco > 0 && Math.abs(Number(v.price) - preco) > 0.005) {
        de_para.push({ campo: "Preço", shopify: v.price, novo: preco.toFixed(2) });
        inputVar.price = preco.toFixed(2);
      }
      // Código de barras
      if (ean && semZero(v.barcode) !== semZero(ean)) {
        de_para.push({ campo: "Código de barras", shopify: v.barcode ?? null, novo: txt(f.ean) });
        inputVar.barcode = txt(f.ean);
      }
      // SKU do anúncio (achado por EAN com outro SKU)
      if (txt(v.sku).toUpperCase() !== sku.toUpperCase()) {
        de_para.push({ campo: "SKU do anúncio", shopify: v.sku ?? null, novo: sku });
        inv.sku = sku;
      }
      // Peso
      const pesoSncf = f.peso_g === null || f.peso_g === undefined ? null : Number(f.peso_g);
      const w = v.inventoryItem?.measurement?.weight;
      const pesoLoja = w && FATOR_G[w.unit] !== undefined && w.value !== null ? Number(w.value) * FATOR_G[w.unit] : null;
      if (pesoSncf !== null && pesoSncf > 0 && (pesoLoja === null || Math.abs(pesoLoja - pesoSncf) > TOL_PESO_G)) {
        de_para.push({ campo: "Peso (g)", shopify: pesoLoja === null ? null : Math.round(pesoLoja * 1000) / 1000, novo: pesoSncf });
        inv.measurement = { weight: { unit: "GRAMS", value: pesoSncf } };
        const invId = idNumerico(v.inventoryItem?.id);
        if (invId) pesoPlanejado.set(sku, { produtoId, invId, peso_g: pesoSncf });
      }
      if (Object.keys(inv).length > 0) inputVar.inventoryItem = inv;

      // Marca (por produto)
      const marca = txt(f.marca);
      if (marca) {
        const vendorLoja = txt(v.product.vendor);
        const mfLoja = txt(v.product.marca?.value);
        const p = planoProduto.get(produtoId) ?? {};
        if (vendorLoja !== marca) { de_para.push({ campo: "Marca (fabricante)", shopify: v.product.vendor ?? null, novo: marca }); p.vendor = marca; }
        if (mfLoja !== marca) { de_para.push({ campo: "Marca (metacampo)", shopify: v.product.marca?.value ?? null, novo: marca }); p.marca = marca; }
        if (p.vendor || p.marca) planoProduto.set(produtoId, p);
      }

      if (de_para.length === 0) { resultados.push({ sku, status: "sem_mudanca", produto: v.product.title }); continue; }
      if (Object.keys(inputVar).length > 1) {
        const lista = planoVariantes.get(produtoId) ?? [];
        lista.push(inputVar);
        planoVariantes.set(produtoId, lista);
      }
      skusPorProduto.set(produtoId, [...(skusPorProduto.get(produtoId) ?? []), sku]);
      resultados.push({ sku, status: dryRun ? "dry_run" : "pendente", produto: v.product.title, de_para });
    }

    if (!dryRun) {
      const marcarErro = (produtoId: string, msg: string) => {
        for (const s of skusPorProduto.get(produtoId) ?? []) {
          const r = resultados.find((x) => x.sku === s);
          if (r && r.status === "pendente") { r.status = "erro"; r.erro = msg; }
        }
      };
      const varianteOk = new Set<string>();
      for (const [produtoId, inputs] of planoVariantes) {
        const r = await shop.gql<Linha>(M_VAR, { p: produtoId, v: inputs });
        const ue = r.data?.productVariantsBulkUpdate?.userErrors ?? [];
        if (r.status !== 200 || r.errors || ue.length > 0) marcarErro(produtoId, `variantes: ${JSON.stringify(r.errors ?? ue).slice(0, 400)}`);
        else varianteOk.add(produtoId);
      }
      // Espelho do peso: gravar em shopify_variante_peso o peso que acabou de ir ao Shopify,
      // senão a Conciliação mantém a linha na fila até o pull diário. Falha aqui não desfaz
      // nada no Shopify — vira aviso na linha (mesmo padrão da corrigir-produto-bling).
      for (const [sku, p] of pesoPlanejado) {
        if (!varianteOk.has(p.produtoId)) continue;
        const { error: espErr } = await supabase
          .from("shopify_variante_peso")
          .upsert({ inventory_item_id: p.invId, peso_g: p.peso_g, lido_em: new Date().toISOString() }, { onConflict: "inventory_item_id" });
        if (espErr) {
          const r = resultados.find((x) => x.sku === sku);
          if (r) r.de_para = [...(r.de_para ?? []), { campo: "espelho", shopify: null, novo: `espelho do peso não atualizado: ${espErr.message}` }];
        }
      }
      for (const [produtoId, p] of planoProduto) {
        const input: Linha = { id: produtoId };
        if (p.vendor) input.vendor = p.vendor;
        if (p.marca) input.metafields = [{ namespace: "custom", key: "marca", type: "single_line_text_field", value: p.marca }];
        const r = await shop.gql<Linha>(M_PROD, { input });
        const ue = r.data?.productUpdate?.userErrors ?? [];
        if (r.status !== 200 || r.errors || ue.length > 0) marcarErro(produtoId, `produto: ${JSON.stringify(r.errors ?? ue).slice(0, 400)}`);
      }
      for (const r of resultados) if (r.status === "pendente") r.status = "corrigido";

      const ok = resultados.filter((r) => r.status === "corrigido").length;
      const erro = resultados.filter((r) => r.status === "erro").length;
      const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
        sistema: "shopify", tipo: "corrigir_produto_shopify",
        status: erro === 0 ? "sucesso" : ok > 0 ? "parcial" : "erro",
        registros_atualizados: ok, registros_erro: erro, iniciado_por: userId, duracao_ms: Date.now() - t0,
        detalhes: JSON.stringify({ skus, resultados }),
      });
      if (logErr) return json({ ok: false, erro: `Correções aplicadas, mas o log falhou: ${logErr.message}`, resultados }, 500);
    }
    return json({ ok: true, dry_run: dryRun, total: skus.length, resultados });
  } catch (e) {
    return json({ ok: false, erro: (e as Error).message, resultados }, 500);
  }
});
