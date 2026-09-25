// shopify-cadastrar-produto — SNCF cria produto no Shopify (F1: 1 SKU = 1 produto).
// Mapa: sncf_documentacao slug `mapa-cadastro-produto-shopify-v1`.
// Regras: status SEMPRE DRAFT (forçado aqui, nunca vem do cliente) · teto 10 SKUs ·
// dry_run é o default · anti-duplicata consultando o Shopify AO VIVO antes de criar ·
// FAIL-LOUD: cada SKU volta com status próprio e a rodada real grava integracoes_sync_log.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { makeShopifyAdmin } from "../_shared/shopify/admin-client.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const TETO = 10;
const ACAO = "acao.cadastrar_produto_shopify";

const Q_SKU = `query($q: String!) {
  productVariants(first: 5, query: $q) { nodes { id sku barcode product { id title status handle } } }
}`;

const M_SET = `mutation($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle status variants(first: 1) { nodes { id sku inventoryItem { id } } } }
    userErrors { field message code }
  }
}`;

// deno-lint-ignore no-explicit-any
type Linha = any;

function montarInput(l: Linha) {
  const variante: Record<string, unknown> = {
    optionValues: [{ optionName: "Title", name: "Default Title" }],
    sku: String(l.sku).trim(),
    price: Number(l.preco_varejo).toFixed(2),
    inventoryPolicy: "DENY",
    inventoryItem: {
      tracked: true,
      ...(Number(l.peso_g) > 0
        ? { measurement: { weight: { unit: "GRAMS", value: Number(l.peso_g) } } }
        : {}),
    },
  };
  const ean = (l.ean ?? "").trim();
  if (ean) variante.barcode = ean;

  const input: Record<string, unknown> = {
    title: String(l.nome_comercial).trim(),
    status: "DRAFT",
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [variante],
  };
  const desc = (l.descricao_produto ?? "").trim();
  if (desc) input.descriptionHtml = desc;
  if ((l.marca ?? "").trim()) input.vendor = String(l.marca).trim();
  if ((l.grupo ?? "").trim()) input.productType = String(l.grupo).trim();

  // Metacampos com fonte certa no SNCF (definições já existem na loja).
  // Fora de propósito: custom.medida (formato quebrado na loja), custom.produto e custom.codigo (sem fonte no SNCF).
  const mf: Record<string, unknown>[] = [];
  const texto = (key: string, v: unknown) => {
    const s = String(v ?? "").trim();
    if (s) mf.push({ namespace: "custom", key, type: "single_line_text_field", value: s });
  };
  const decimal = (key: string, v: unknown) => {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) mf.push({ namespace: "meucorreios", key, type: "number_decimal", value: String(n) });
  };
  texto("nome_produto", l.nome_comercial);
  texto("linha", l.linha);
  texto("colecao", l.colecao);
  texto("tipo_produto", l.grupo);
  texto("marca", l.marca);
  texto("material", l.material);
  decimal("altura", l.altura_cm);
  decimal("largura", l.largura_cm);
  decimal("comprimento", l.profundidade_cm);
  if (mf.length > 0) input.metafields = mf;
  return input;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- auth + permissão (GUARDA-ACAO) ----
  const auth = req.headers.get("Authorization");
  if (!auth) return json(401, { ok: false, erro: "Não autorizado: token ausente." });
  const { data: u, error: uErr } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json(401, { ok: false, erro: "Não autorizado: sessão inválida." });
  const userId = u.user.id;
  const { data: temAcao } = await supabase.rpc("usuario_tem_acao", { p_slug: ACAO, p_user_id: userId });
  let permitido = !!temAcao;
  if (!permitido) {
    const { data: ehSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
    permitido = !!ehSuper;
  }
  if (!permitido) return json(403, { ok: false, erro: `Sem permissão (${ACAO}).` });

  // ---- entrada ----
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, erro: "Corpo JSON inválido." }); }
  const skus = Array.isArray(body.skus)
    ? [...new Set((body.skus as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean))]
    : [];
  const dry_run = body.dry_run !== false; // default seguro: só simula
  if (skus.length === 0) return json(400, { ok: false, erro: "Nenhum SKU informado." });
  if (skus.length > TETO) return json(400, { ok: false, erro: `Máximo de ${TETO} SKUs por envio (recebidos ${skus.length}).` });

  const resultados: Record<string, unknown>[] = [];
  try {
    // Fonte do payload = vw_shopify_cadastro_fila (mesma regra da tela) + descricao_produto do cadastro.
    const { data: fila, error: fErr } = await supabase
      .from("vw_shopify_cadastro_fila")
      .select("sku, cod_cadastro, fase, nome_comercial, marca, grupo, preco_varejo, ean, peso_g, avisos, pode_enviar")
      .in("sku", skus);
    if (fErr) throw new Error(`leitura da fila falhou: ${fErr.message}`);
    const { data: cad, error: dErr } = await supabase
      .from("sncf_produtos")
      .select("sku, descricao_produto, linha, colecao, material, altura_cm, largura_cm, profundidade_cm")
      .in("sku", skus);
    if (dErr) throw new Error(`leitura do cadastro falhou: ${dErr.message}`);
    const cadPorSku = new Map((cad ?? []).map((d: Linha) => [d.sku, d]));
    const porSku = new Map((fila ?? []).map((l: Linha) => [l.sku, { ...l, ...(cadPorSku.get(l.sku) ?? {}) }]));

    const shop = await makeShopifyAdmin(supabase);

    for (const sku of skus) {
      const l = porSku.get(sku);
      if (!l) { resultados.push({ sku, status: "fora_da_fila", erro: "SKU não está na fila (fase/canal não elegível ou já existe no Shopify)." }); continue; }
      if (!l.pode_enviar) { resultados.push({ sku, status: "bloqueado", erro: "Falta preço de varejo ou nome comercial.", avisos: l.avisos }); continue; }

      // Anti-duplicata AO VIVO por SKU OU EAN: o espelho local pode ter fóssil, estar defasado,
      // cortar variantes (>100) ou o produto existir no Shopify com outro SKU e o mesmo EAN.
      const eanNorm = (l.ean ?? "").replace(/\D/g, "");
      const eanSemZero = eanNorm.replace(/^0+/, "");
      const termos = [`sku:"${sku.replace(/"/g, '\\"')}"`];
      if (eanNorm) termos.push(`barcode:${eanNorm}`);
      if (eanSemZero && eanSemZero !== eanNorm) termos.push(`barcode:${eanSemZero}`);
      const q = await shop.gql<Linha>(Q_SKU, { q: termos.join(" OR ") });
      if (q.status !== 200 || q.errors) {
        resultados.push({ sku, status: "erro", etapa: "consulta_sku", erro: JSON.stringify(q.errors ?? q.body).slice(0, 500) });
        continue;
      }
      const normBar = (b: unknown) => String(b ?? "").replace(/\D/g, "").replace(/^0+/, "");
      const achados = (q.data?.productVariants?.nodes ?? []).filter((n: Linha) =>
        String(n.sku ?? "").trim().toUpperCase() === sku.toUpperCase() ||
        (!!eanSemZero && normBar(n.barcode) === eanSemZero));
      if (achados.length > 0) {
        const a = achados[0];
        const porEan = String(a.sku ?? "").trim().toUpperCase() !== sku.toUpperCase();
        resultados.push({
          sku, status: "ja_existe",
          motivo: porEan ? "mesmo_ean_outro_sku" : "mesmo_sku",
          sku_no_shopify: a.sku ?? null, barcode_no_shopify: a.barcode ?? null, produto: a.product,
        });
        continue;
      }

      const input = montarInput(l);
      if (dry_run) { resultados.push({ sku, status: "dry_run", avisos: l.avisos, payload: input }); continue; }

      const r = await shop.gql<Linha>(M_SET, { input });
      const ue = r.data?.productSet?.userErrors ?? [];
      if (r.status !== 200 || r.errors || ue.length > 0 || !r.data?.productSet?.product) {
        resultados.push({ sku, status: "erro", etapa: "productSet", erro: JSON.stringify(r.errors ?? ue ?? r.body).slice(0, 800), payload: input });
        continue;
      }
      const p = r.data.productSet.product;
      resultados.push({ sku, status: "ok", shopify_product_id: p.id, handle: p.handle, shopify_status: p.status, variante: p.variants?.nodes?.[0] ?? null });
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry_run) {
      await supabase.from("integracoes_sync_log").insert({
        sistema: "shopify", tipo: "cadastrar_produto", status: "erro",
        registros_criados: resultados.filter((r) => r.status === "ok").length,
        registros_erro: skus.length, iniciado_por: userId, duracao_ms: Date.now() - t0,
        detalhes: JSON.stringify({ erro: msg, resultados }),
      });
    }
    return json(500, { ok: false, erro: msg, resultados });
  }

  if (!dry_run) {
    const ok = resultados.filter((r) => r.status === "ok").length;
    const erro = resultados.filter((r) => r.status === "erro").length;
    const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
      sistema: "shopify", tipo: "cadastrar_produto",
      status: erro === 0 ? "sucesso" : ok > 0 ? "parcial" : "erro",
      registros_criados: ok, registros_erro: erro, iniciado_por: userId, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify({ skus, resultados }),
    });
    if (logErr) return json(500, { ok: false, erro: `Produtos processados, mas o log falhou: ${logErr.message}`, resultados });
  }
  return json(200, { ok: true, dry_run, total: skus.length, resultados });
});
