// shopify-adicionar-variante — adiciona SKU do SNCF como VARIANTE de um produto agrupado já existente no Shopify.
// Mapa: sncf_documentacao slug `mapa-shopify-adicionar-variante-v1`.
// modo "sugerir": lê o produto-alvo AO VIVO e sugere o valor de cada opção a partir da variante-irmã.
// modo "adicionar" (dry_run default true): valida e cria via productVariantsBulkCreate, estoque 0 em todos
// os locais com centro; "reter" (default true) abre shopify_estoque_retencao → push ignora até liberar.
// FAIL-LOUD: cada SKU volta com status próprio; rodada real grava integracoes_sync_log.
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

// deno-lint-ignore no-explicit-any
type Linha = any;

const Q_PRODUTO = `query($id: ID!) {
  product(id: $id) {
    id title status
    options { name position optionValues { name } }
    variants(first: 250) { nodes { id sku barcode selectedOptions { name value } } }
  }
}`;
const Q_SKU = `query($q: String!) {
  productVariants(first: 5, query: $q) { nodes { id sku barcode product { id title } } }
}`;
const M_CRIAR = `mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) {
  productVariantsBulkCreate(productId: $p, variants: $v) {
    productVariants { id sku barcode title inventoryItem { id } }
    userErrors { field message code }
  }
}`;

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const segs = (sku: string) => String(sku ?? "").toUpperCase().split(/[./]/);
// Parecença entre SKUs: segmentos iguais na mesma posição (VNVPM.SC.5.0 x VNAPM.SC.5.0 = 3).
const parecenca = (a: string, b: string) => {
  const x = segs(a), y = segs(b);
  let n = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] === y[i]) n++;
  return n;
};
// Campos do SNCF que podem alimentar uma opção do Shopify.
const CAMPOS = ["cor", "estampa", "familia"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t0 = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ---- auth + permissão ----
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

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, { ok: false, erro: "Corpo JSON inválido." }); }
  const modo = String(body.modo ?? "sugerir");
  const itensIn: Linha[] = Array.isArray(body.itens) ? body.itens as Linha[] : [];
  const skus = [...new Set(itensIn.map((i) => String(i?.sku ?? "").trim()).filter(Boolean))];
  if (skus.length === 0) return json(400, { ok: false, erro: "Nenhum SKU informado." });
  if (skus.length > TETO) return json(400, { ok: false, erro: `Máximo de ${TETO} SKUs por envio.` });

  try {
    // ---- fila: todos elegíveis e para o MESMO produto-alvo ----
    const { data: fila, error: fErr } = await supabase
      .from("vw_shopify_cadastro_fila")
      .select("sku, cod_cadastro, nome_comercial, preco_varejo, ean, peso_g, avisos, pode_adicionar_variante, produto_agrupado, produto_agrupado_id")
      .in("sku", skus);
    if (fErr) throw new Error(`leitura da fila falhou: ${fErr.message}`);
    const porSku = new Map((fila ?? []).map((l: Linha) => [l.sku, l]));
    const fora = skus.filter((s) => !porSku.get(s)?.pode_adicionar_variante);
    if (fora.length > 0) {
      return json(400, { ok: false, erro: `SKU não elegível para variante: ${fora.map((s) => `${s} (${(porSku.get(s)?.avisos ?? ["fora da fila"]).join(", ")})`).join("; ")}` });
    }
    const alvos = [...new Set(skus.map((s) => porSku.get(s).produto_agrupado_id))];
    if (alvos.length !== 1) return json(400, { ok: false, erro: "Os SKUs selecionados pertencem a produtos diferentes. Envie um produto por vez." });
    const produtoGid = `gid://shopify/Product/${alvos[0]}`;

    const shop = await makeShopifyAdmin(supabase);
    const qp = await shop.gql<Linha>(Q_PRODUTO, { id: produtoGid });
    if (qp.status !== 200 || qp.errors || !qp.data?.product) throw new Error(`leitura do produto-alvo falhou: ${JSON.stringify(qp.errors ?? qp.body).slice(0, 300)}`);
    const prod = qp.data.product;
    const opcoes: { name: string; values: string[] }[] = (prod.options ?? [])
      .sort((a: Linha, b: Linha) => a.position - b.position)
      .map((o: Linha) => ({ name: o.name, values: (o.optionValues ?? []).map((v: Linha) => v.name) }));
    const variantes: Linha[] = prod.variants?.nodes ?? [];

    // Cadastro SNCF dos novos + das irmãs candidatas.
    const skusLoja = variantes.map((v) => String(v.sku ?? "").trim()).filter(Boolean);
    const { data: cad, error: cErr } = await supabase
      .from("sncf_produtos").select(`sku, ${CAMPOS.join(", ")}`).in("sku", [...skus, ...skusLoja]);
    if (cErr) throw new Error(`leitura do cadastro falhou: ${cErr.message}`);
    const cadPorSku = new Map((cad ?? []).map((c: Linha) => [String(c.sku).toUpperCase(), c]));

    if (modo === "sugerir") {
      const sugestoes = skus.map((sku) => {
        const novo = cadPorSku.get(sku.toUpperCase()) ?? {};
        const irma = variantes
          .filter((v) => v.sku && cadPorSku.has(String(v.sku).toUpperCase()))
          .map((v) => ({ v, n: parecenca(sku, v.sku) }))
          .sort((a, b) => b.n - a.n)[0]?.v;
        if (!irma) return { sku, erro: "Nenhuma variante-irmã do produto está no cadastro do SNCF — preencha as opções manualmente.", opcoes: opcoes.map((o) => ({ nome: o.name, valor: "", origem: "manual" })) };
        const cadIrma = cadPorSku.get(String(irma.sku).toUpperCase()) ?? {};
        const sel = new Map((irma.selectedOptions ?? []).map((s: Linha) => [s.name, s.value]));
        return {
          sku, irma_sku: irma.sku,
          opcoes: opcoes.map((o) => {
            const valorIrma = String(sel.get(o.name) ?? "");
            const campo = CAMPOS.find((c) => cadIrma[c] && norm(cadIrma[c]) === norm(valorIrma));
            if (campo && novo[campo]) return { nome: o.name, valor: String(novo[campo]).trim(), origem: `campo ${campo}` };
            return { nome: o.name, valor: valorIrma, origem: "igual à irmã" };
          }),
        };
      });
      return json(200, { ok: true, modo, produto: { id: prod.id, titulo: prod.title, status: prod.status, opcoes }, sugestoes });
    }

    if (modo !== "adicionar") return json(400, { ok: false, erro: `modo inválido: ${modo}` });
    const dry_run = body.dry_run !== false;
    const reter = body.reter !== false;

    const { data: locs, error: lErr } = await supabase
      .from("shopify_location").select("location_id").not("centro_id", "is", null).eq("ativo_shopify", true);
    if (lErr) throw new Error(`leitura de shopify_location falhou: ${lErr.message}`);
    const locais = (locs ?? []).map((x: Linha) => String(x.location_id));
    if (locais.length === 0) throw new Error("nenhum local Shopify amarrado a centro em shopify_location");

    const combos = new Set(variantes.map((v) => (v.selectedOptions ?? []).map((s: Linha) => `${s.name}=${norm(s.value)}`).sort().join("|")));
    const resultados: Linha[] = [];
    const inputs: Linha[] = [];
    const vistosLote = new Set<string>();

    for (const it of itensIn) {
      const sku = String(it?.sku ?? "").trim();
      const l = porSku.get(sku);
      const valores: Linha[] = Array.isArray(it?.opcoes) ? it.opcoes : [];
      const mapa = new Map(valores.map((o: Linha) => [String(o?.nome ?? ""), String(o?.valor ?? "").trim()]));
      const faltam = opcoes.filter((o) => !mapa.get(o.name));
      if (faltam.length > 0) { resultados.push({ sku, status: "bloqueado", erro: `Opção sem valor: ${faltam.map((o) => o.name).join(", ")}` }); continue; }
      const chave = opcoes.map((o) => `${o.name}=${norm(mapa.get(o.name))}`).sort().join("|");
      if (combos.has(chave) || vistosLote.has(chave)) { resultados.push({ sku, status: "bloqueado", erro: "Essa combinação de opções já existe no produto." }); continue; }

      // Anti-duplicata ao vivo por SKU ou EAN.
      const ean = String(l.ean ?? "").replace(/\D/g, "");
      const eanSemZero = ean.replace(/^0+/, "");
      const termos = [`sku:"${sku.replace(/"/g, '\\"')}"`];
      if (ean) termos.push(`barcode:${ean}`);
      if (eanSemZero && eanSemZero !== ean) termos.push(`barcode:${eanSemZero}`);
      const q = await shop.gql<Linha>(Q_SKU, { q: termos.join(" OR ") });
      if (q.status !== 200 || q.errors) { resultados.push({ sku, status: "erro", etapa: "consulta_sku", erro: JSON.stringify(q.errors ?? q.body).slice(0, 300) }); continue; }
      const nb = (b: unknown) => String(b ?? "").replace(/\D/g, "").replace(/^0+/, "");
      const achado = (q.data?.productVariants?.nodes ?? []).find((n: Linha) =>
        String(n.sku ?? "").trim().toUpperCase() === sku.toUpperCase() || (!!eanSemZero && nb(n.barcode) === eanSemZero));
      if (achado) { resultados.push({ sku, status: "ja_existe", sku_no_shopify: achado.sku, produto: achado.product }); continue; }

      vistosLote.add(chave);
      const input: Linha = {
        optionValues: opcoes.map((o) => ({ optionName: o.name, name: mapa.get(o.name) })),
        price: Number(l.preco_varejo).toFixed(2),
        inventoryPolicy: "DENY",
        inventoryItem: {
          sku, tracked: true,
          ...(Number(l.peso_g) > 0 ? { measurement: { weight: { unit: "GRAMS", value: Number(l.peso_g) } } } : {}),
        },
        inventoryQuantities: locais.map((loc) => ({ locationId: `gid://shopify/Location/${loc}`, availableQuantity: 0 })),
      };
      if (ean) input.barcode = String(l.ean).trim();
      inputs.push({ sku, input });
      resultados.push({ sku, status: dry_run ? "dry_run" : "pendente", payload: input });
    }

    if (dry_run || inputs.length === 0) {
      return json(200, { ok: true, modo, dry_run, reter, produto: { id: prod.id, titulo: prod.title, status: prod.status }, resultados });
    }

    const r = await shop.gql<Linha>(M_CRIAR, { p: produtoGid, v: inputs.map((x) => x.input) });
    const ue = r.data?.productVariantsBulkCreate?.userErrors ?? [];
    const criadas: Linha[] = r.data?.productVariantsBulkCreate?.productVariants ?? [];
    if (r.status !== 200 || r.errors || ue.length > 0) {
      for (const x of resultados) if (x.status === "pendente") { x.status = "erro"; x.etapa = "productVariantsBulkCreate"; x.erro = JSON.stringify(r.errors ?? ue).slice(0, 600); }
    } else {
      const agora = new Date().toISOString();
      for (const c of criadas) {
        const x = resultados.find((y) => y.sku === c.sku && y.status === "pendente");
        if (!x) continue;
        const itemId = String(c.inventoryItem?.id ?? "").split("/").pop() ?? "";
        const { error: eErr } = await supabase.from("shopify_estoque").upsert(
          locais.map((loc) => ({ inventory_item_id: itemId, location_id: loc, available: 0, updated_at: agora })),
          { onConflict: "inventory_item_id,location_id" },
        );
        if (eErr) { x.status = "erro"; x.etapa = "espelho_estoque"; x.erro = `variante criada, mas espelho de estoque falhou: ${eErr.message}`; continue; }
        if (reter) {
          const { error: rErr } = await supabase.from("shopify_estoque_retencao")
            .insert({ sku: c.sku, motivo: `variante nova em ${prod.title}`, retido_por: userId });
          if (rErr && !String(rErr.message).includes("duplicate")) { x.status = "erro"; x.etapa = "retencao"; x.erro = `variante criada, mas retenção falhou (estoque vai subir no push): ${rErr.message}`; continue; }
        }
        x.status = "ok"; x.variante_id = c.id; x.titulo = c.title; x.retido = reter; delete x.payload;
      }
      for (const x of resultados) if (x.status === "pendente") { x.status = "erro"; x.erro = "Shopify não devolveu a variante criada."; }
    }

    const ok = resultados.filter((x) => x.status === "ok").length;
    const erro = resultados.filter((x) => x.status === "erro").length;
    const { error: logErr } = await supabase.from("integracoes_sync_log").insert({
      sistema: "shopify", tipo: "adicionar_variante",
      status: erro === 0 ? "sucesso" : ok > 0 ? "parcial" : "erro",
      registros_criados: ok, registros_erro: erro, iniciado_por: userId, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify({ produto: prod.id, titulo: prod.title, reter, resultados }),
    });
    if (logErr) return json(500, { ok: false, erro: `Variantes processadas, mas o log falhou: ${logErr.message}`, resultados });
    return json(200, { ok: true, modo, dry_run: false, reter, produto: { id: prod.id, titulo: prod.title }, resultados });
  } catch (e) {
    return json(500, { ok: false, erro: (e as Error).message });
  }
});
