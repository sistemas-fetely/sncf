// shopify-publicar-agrupamento — VARIACAO-PRODUTO fase 2.
// Mapa: sncf_documentacao slug `mapa-variacao-produto-v1`.
// Publica UM agrupamento (pai) em RASCUNHO no Shopify: cria 1 produto DRAFT com as variantes
// (opções = eixos do agrupamento) e REMOVE os produtos soltos que hoje carregam esses SKUs.
// Regras: SKU não muda (variante usa codigo_externo) · produto nasce DRAFT (forçado aqui) ·
// dry_run é o default · leitura AO VIVO do Shopify antes de qualquer escrita ·
// só remove produto solto que seja DRAFT/ARCHIVED e cujas variantes sejam TODAS do grupo ·
// produto ATIVO ou com SKU de fora do grupo → bloqueia (fase 3) · nada é removido se a criação falhar ·
// FAIL-LOUD: rodada real grava integracoes_sync_log tipo `publicar_agrupamento`.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { makeShopifyAdmin } from "../_shared/shopify/admin-client.ts";
import { colecoesFaltantes, garantirColecoesCadastro, lerColecoesCadastro, type ColecaoCriada } from "../_shared/shopify/colecoes-cadastro.ts";
import { mapaCodigoExterno } from "../_shared/produto-codigo.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ACAO = "acao.cadastrar_produto_shopify";
const TETO_VARIANTES = 250;

// deno-lint-ignore no-explicit-any
type Linha = any;

const Q_BUSCA = `query($q: String!) {
  productVariants(first: 50, query: $q) {
    nodes { id sku barcode product { id title status handle } }
  }
}`;
const Q_PRODUTO = `query($id: ID!) {
  product(id: $id) { id title status handle variants(first: 250) { nodes { id sku barcode } } }
}`;
const M_SET = `mutation($input: ProductSetInput!) {
  productSet(synchronous: true, input: $input) {
    product { id handle status variants(first: 250) { nodes { id sku inventoryItem { id } } } }
    userErrors { field message code }
  }
}`;
const M_DELETE = `mutation($input: ProductDeleteInput!) {
  productDelete(input: $input) { deletedProductId userErrors { field message } }
}`;

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const semZero = (s: unknown) => soDig(s).replace(/^0+/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
  const agrupamentoId = String(body.agrupamento_id ?? "").trim();
  const dry_run = body.dry_run !== false;
  const colecoesCriadas: ColecaoCriada[] = [];
  if (!agrupamentoId) return json(400, { ok: false, erro: "agrupamento_id não informado." });

  const log = async (status: string, criados: number, erros: number, detalhes: unknown) => {
    const { error } = await supabase.from("integracoes_sync_log").insert({
      sistema: "shopify", tipo: "publicar_agrupamento", status,
      registros_criados: criados, registros_erro: erros, iniciado_por: userId, duracao_ms: Date.now() - t0,
      detalhes: JSON.stringify(detalhes),
    });
    return error;
  };

  try {
    // ---- agrupamento ----
    const { data: ag, error: aErr } = await supabase.from("produto_agrupamento")
      .select("id, sistema, colecao, titulo, status").eq("id", agrupamentoId).maybeSingle();
    if (aErr) throw new Error(`leitura do agrupamento falhou: ${aErr.message}`);
    if (!ag) return json(404, { ok: false, erro: "Agrupamento não encontrado." });
    if (ag.sistema !== "Shopify") return json(400, { ok: false, erro: `Agrupamento é do sistema ${ag.sistema}, não Shopify.` });
    if (ag.status !== "rascunho") return json(400, { ok: false, erro: `Agrupamento está "${ag.status}". Só rascunho pode ser publicado (reagrupar publicado é a fase 3).` });

    const { data: eixos, error: eErr } = await supabase.from("produto_agrupamento_eixo")
      .select("posicao, campo, nome_opcao").eq("agrupamento_id", agrupamentoId).order("posicao");
    if (eErr) throw new Error(`leitura dos eixos falhou: ${eErr.message}`);
    if (!eixos?.length || eixos.length > 3) throw new Error(`Agrupamento com ${eixos?.length ?? 0} eixos (precisa de 1 a 3).`);

    const { data: membros, error: mErr } = await supabase.from("produto_agrupamento_sku")
      .select("sku, valores").eq("agrupamento_id", agrupamentoId).eq("vigente", true);
    if (mErr) throw new Error(`leitura dos SKUs falhou: ${mErr.message}`);
    if (!membros?.length) throw new Error("Agrupamento sem SKUs vigentes.");
    if (membros.length > TETO_VARIANTES) throw new Error(`Agrupamento com ${membros.length} SKUs (máximo ${TETO_VARIANTES} por envio).`);
    const skus = membros.map((m: Linha) => String(m.sku));

    // ---- cadastro SNCF ----
    const { data: cad, error: cErr } = await supabase.from("sncf_produtos")
      .select("sku, nome_comercial, descricao_produto, marca, grupo, linha, colecao, material, preco_varejo, ean, peso_g, altura_cm, largura_cm, profundidade_cm")
      .in("sku", skus);
    if (cErr) throw new Error(`leitura do cadastro falhou: ${cErr.message}`);
    const cadPorSku = new Map((cad ?? []).map((c: Linha) => [String(c.sku), c]));
    const { data: atr, error: atErr } = await supabase.from("vw_shopify_atributos_produto")
      .select("sku, codigo_shopify, colecoes_shopify").in("sku", skus);
    if (atErr) throw new Error(`leitura dos atributos Shopify falhou: ${atErr.message}`);
    const atrPorSku = new Map((atr ?? []).map((a: Linha) => [String(a.sku), a]));
    const codigos = await mapaCodigoExterno(supabase, skus);

    // Freio "aguardando medição" (mesma regra do cadastro): campos da ficha com exigido_para = 'medicao'.
    const { data: med, error: mdErr } = await supabase
      .from("produto_ficha_nascimento").select("campo, rotulo").eq("exigido_para", "medicao").order("ordem");
    if (mdErr) throw new Error(`leitura dos campos de medição falhou: ${mdErr.message}`);
    const camposMed = (med ?? []) as { campo: string; rotulo: string | null }[];
    const medPorSku = new Map<string, Linha>();
    if (camposMed.length) {
      const { data: mv, error: mvErr } = await supabase.from("sncf_produtos")
        .select(["sku", ...camposMed.map((c) => c.campo)].join(",")).in("sku", skus);
      if (mvErr) throw new Error(`leitura dos valores de medição falhou: ${mvErr.message}`);
      for (const r of (mv ?? []) as unknown as Linha[]) medPorSku.set(String(r.sku), r);
    }
    const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "" ||
      (!isNaN(Number(v)) && String(v).trim() !== "" && Number(v) <= 0);

    const bloqueios: Linha[] = [];
    for (const m of membros as Linha[]) {
      const c = cadPorSku.get(String(m.sku));
      if (!c) { bloqueios.push({ sku: m.sku, erro: "SKU não está no cadastro do SNCF." }); continue; }
      if (!codigos.get(String(m.sku))) bloqueios.push({ sku: m.sku, erro: "sem codigo_externo" });
      if (!(Number(c.preco_varejo) > 0)) bloqueios.push({ sku: m.sku, erro: "sem preço de varejo" });
      for (const e of eixos as Linha[]) if (!String(m.valores?.[e.campo] ?? "").trim()) bloqueios.push({ sku: m.sku, erro: `sem valor para ${e.nome_opcao}` });
      const falta = camposMed.filter((f) => vazio((medPorSku.get(String(m.sku)) ?? {})[f.campo]));
      if (falta.length) bloqueios.push({ sku: m.sku, erro: `aguardando medição: ${falta.map((f) => (f.rotulo || f.campo).toLowerCase()).join(", ")}` });
    }
    const combos = new Set<string>();
    for (const m of membros as Linha[]) {
      const k = (eixos as Linha[]).map((e) => norm(m.valores?.[e.campo])).join("|");
      if (combos.has(k)) bloqueios.push({ sku: m.sku, erro: "combinação de opções repetida no grupo" });
      combos.add(k);
    }

    const shop = await makeShopifyAdmin(supabase);

    // ---- locais e coleções ----
    const { data: locs, error: lErr } = await supabase
      .from("shopify_location").select("location_id").not("centro_id", "is", null).eq("ativo_shopify", true);
    if (lErr) throw new Error(`leitura de shopify_location falhou: ${lErr.message}`);
    const locais = (locs ?? []).map((x: Linha) => String(x.location_id));
    if (!locais.length) throw new Error("nenhum local Shopify amarrado a centro em shopify_location");

    const colecaoPorNome = await lerColecoesCadastro(shop);
    const titulosColecao = [...new Set(skus.flatMap((s) => (atrPorSku.get(s)?.colecoes_shopify ?? []) as string[]))];
    const faltaColecao = colecoesFaltantes(titulosColecao, colecaoPorNome);

    // ---- produtos soltos AO VIVO (por SKU interno, código externo e EAN) ----
    const doGrupo = new Set<string>();
    const eanDoGrupo = new Set<string>();
    for (const s of skus) {
      doGrupo.add(s.toUpperCase());
      const c = codigos.get(s); if (c) doGrupo.add(c.toUpperCase());
      const e = semZero(cadPorSku.get(s)?.ean); if (e) eanDoGrupo.add(e);
    }
    const produtosAchados = new Map<string, Linha>();
    for (const s of skus) {
      const termos = [`sku:"${esc(s)}"`];
      const c = codigos.get(s); if (c && c !== s) termos.push(`sku:"${esc(c)}"`);
      const ean = soDig(cadPorSku.get(s)?.ean);
      if (ean) termos.push(`barcode:${ean}`);
      if (ean && semZero(ean) !== ean) termos.push(`barcode:${semZero(ean)}`);
      const q = await shop.gql<Linha>(Q_BUSCA, { q: termos.join(" OR ") });
      if (q.status !== 200 || q.errors) throw new Error(`consulta ao vivo de ${s} falhou: ${JSON.stringify(q.errors ?? q.body).slice(0, 300)}`);
      for (const n of q.data?.productVariants?.nodes ?? []) {
        const casa = doGrupo.has(String(n.sku ?? "").trim().toUpperCase()) || (!!semZero(n.barcode) && eanDoGrupo.has(semZero(n.barcode)));
        if (casa && n.product?.id) produtosAchados.set(n.product.id, n.product);
      }
    }
    const remover: Linha[] = [];
    for (const p of produtosAchados.values()) {
      const qp = await shop.gql<Linha>(Q_PRODUTO, { id: p.id });
      if (qp.status !== 200 || qp.errors || !qp.data?.product) throw new Error(`leitura do produto ${p.id} falhou: ${JSON.stringify(qp.errors ?? qp.body).slice(0, 300)}`);
      const prod = qp.data.product;
      const vs: Linha[] = prod.variants?.nodes ?? [];
      const fora = vs.filter((v) => !(doGrupo.has(String(v.sku ?? "").trim().toUpperCase()) || (!!semZero(v.barcode) && eanDoGrupo.has(semZero(v.barcode)))));
      const item = { id: prod.id, titulo: prod.title, status: prod.status, handle: prod.handle, variantes: vs.length, skus: vs.map((v) => v.sku) };
      if (prod.status === "ACTIVE") bloqueios.push({ sku: null, erro: `Produto ATIVO na loja: "${prod.title}". Reagrupar produto ativo é a fase 3.`, produto: item });
      else if (fora.length) bloqueios.push({ sku: null, erro: `"${prod.title}" tem variantes de fora deste grupo (${fora.map((v) => v.sku).join(", ")}). Reagrupar produto com variantes é a fase 3.`, produto: item });
      else remover.push(item);
    }

    // ---- payload ----
    const ordenados = [...(membros as Linha[])].sort((a, b) =>
      (eixos as Linha[]).map((e) => String(a.valores?.[e.campo] ?? "")).join("|")
        .localeCompare((eixos as Linha[]).map((e) => String(b.valores?.[e.campo] ?? "")).join("|"), "pt-BR", { numeric: true }));
    const productOptions = (eixos as Linha[]).map((e) => ({
      name: e.nome_opcao,
      values: [...new Set(ordenados.map((m) => String(m.valores[e.campo]).trim()))].map((name) => ({ name })),
    }));
    const variants = ordenados.map((m) => {
      const c = cadPorSku.get(String(m.sku)) ?? {};
      const v: Record<string, unknown> = {
        optionValues: (eixos as Linha[]).map((e) => ({ optionName: e.nome_opcao, name: String(m.valores[e.campo]).trim() })),
        sku: codigos.get(String(m.sku)) ?? "",
        price: Number(c.preco_varejo ?? 0).toFixed(2),
        inventoryPolicy: "DENY",
        inventoryQuantities: locais.map((loc) => ({ locationId: `gid://shopify/Location/${loc}`, name: "available", quantity: 0 })),
        inventoryItem: { tracked: true, ...(Number(c.peso_g) > 0 ? { measurement: { weight: { unit: "GRAMS", value: Number(c.peso_g) } } } : {}) },
      };
      const ean = String(c.ean ?? "").trim();
      if (ean) v.barcode = ean;
      return v;
    });
    const base = cadPorSku.get(String(ordenados[0].sku)) ?? {};
    const comDesc = ordenados.map((m) => cadPorSku.get(String(m.sku))).find((c: Linha) => String(c?.descricao_produto ?? "").trim());
    const input: Record<string, unknown> = { title: String(ag.titulo).trim(), status: "DRAFT", productOptions, variants };
    if (comDesc) input.descriptionHtml = String(comDesc.descricao_produto).trim();
    if (String(base.marca ?? "").trim()) input.vendor = String(base.marca).trim();
    if (String(base.grupo ?? "").trim()) input.productType = String(base.grupo).trim();
    const mf: Record<string, unknown>[] = [];
    const texto = (key: string, v: unknown) => { const s = String(v ?? "").trim(); if (s) mf.push({ namespace: "custom", key, type: "single_line_text_field", value: s }); };
    const decimal = (key: string, v: unknown) => { const n = Number(v); if (Number.isFinite(n) && n > 0) mf.push({ namespace: "meucorreios", key, type: "number_decimal", value: String(n) }); };
    texto("nome_produto", ag.titulo);
    texto("linha", base.linha);
    texto("colecao", base.colecao);
    texto("tipo_produto", base.grupo);
    texto("marca", base.marca);
    texto("material", base.material);
    texto("codigo", atrPorSku.get(String(ordenados[0].sku))?.codigo_shopify);
    // custom.produto fica VAZIO em produto agrupado (decisão Flavio 27/09: cód. cadastro é por SKU).
    decimal("altura", base.altura_cm);
    decimal("largura", base.largura_cm);
    decimal("comprimento", base.profundidade_cm);
    if (mf.length) input.metafields = mf;
    const colecaoIds = titulosColecao.map((t) => colecaoPorNome.get(norm(t))).filter(Boolean);
    if (colecaoIds.length) input.collections = colecaoIds;

    const resumo = { agrupamento: { id: ag.id, titulo: ag.titulo, colecao: ag.colecao }, variantes: variants.length, opcoes: productOptions, remover, bloqueios, colecoes_a_criar: faltaColecao };
    if (bloqueios.length) return json(200, { ok: false, dry_run, bloqueado: true, ...resumo, erro: `${bloqueios.length} bloqueio(s) — nada foi enviado ao Shopify.` });
    if (dry_run) return json(200, { ok: true, dry_run: true, ...resumo, payload: input });

    const colecoes = await garantirColecoesCadastro(shop, titulosColecao, colecoesCriadas);
    if (colecoes.erros.size) {
      const erro = [...colecoes.erros.values()].join(" · ");
      const resultados = skus.map((sku) => ({ sku, status: "erro", etapa: "criar_colecao", erro }));
      const detalhes = { ...resumo, etapa: "criar_colecao", erro, resultados, colecoes_criadas: colecoesCriadas };
      await log("erro", 0, skus.length, detalhes);
      return json(200, { ok: false, status: "erro", ...detalhes });
    }
    input.collections = titulosColecao.flatMap((t) => { const id = colecoes.mapa.get(norm(t)); return id ? [id] : []; });

    // ---- escrita: 1) cria o pai; 2) espelho de estoque; 3) remove soltos; 4) marca publicado ----
    const r = await shop.gql<Linha>(M_SET, { input });
    const ue = r.data?.productSet?.userErrors ?? [];
    if (r.status !== 200 || r.errors || ue.length || !r.data?.productSet?.product) {
      const erro = JSON.stringify(r.errors ?? ue ?? r.body).slice(0, 800);
      await log("erro", 0, 1, { ...resumo, etapa: "productSet", erro, colecoes_criadas: colecoesCriadas });
      return json(500, { ok: false, etapa: "productSet", erro: `Shopify recusou a criação (nada foi removido): ${erro}` });
    }
    const p = r.data.productSet.product;
    const agora = new Date().toISOString();
    const linhasEstoque = (p.variants?.nodes ?? []).flatMap((v: Linha) => {
      const itemId = String(v.inventoryItem?.id ?? "").split("/").pop() ?? "";
      return itemId ? locais.map((loc) => ({ inventory_item_id: itemId, location_id: loc, available: 0, updated_at: agora })) : [];
    });
    const avisos: string[] = [...colecoes.avisos.values()];
    if (linhasEstoque.length) {
      const { error: esErr } = await supabase.from("shopify_estoque").upsert(linhasEstoque, { onConflict: "inventory_item_id,location_id" });
      if (esErr) avisos.push(`espelho de estoque falhou: ${esErr.message}`);
    }
    const removidos: Linha[] = [];
    const naoRemovidos: Linha[] = [];
    for (const x of remover) {
      const d = await shop.gql<Linha>(M_DELETE, { input: { id: x.id } });
      const due = d.data?.productDelete?.userErrors ?? [];
      if (d.status !== 200 || d.errors || due.length || !d.data?.productDelete?.deletedProductId) naoRemovidos.push({ ...x, erro: JSON.stringify(d.errors ?? due ?? d.body).slice(0, 300) });
      else removidos.push(x);
    }
    const { error: pubErr } = await supabase.rpc("fn_agrupamento_marcar_publicado", { p_id: ag.id, p_id_externo: String(p.id), p_user: userId });
    if (pubErr) avisos.push(`produto criado, mas o agrupamento não foi marcado como publicado: ${pubErr.message}`);

    const status = naoRemovidos.length || avisos.length ? "parcial" : "sucesso";
    const detalhes = { ...resumo, produto: { id: p.id, handle: p.handle, status: p.status }, removidos, nao_removidos: naoRemovidos, avisos, colecoes_criadas: colecoesCriadas };
    const logErr = await log(status, 1, naoRemovidos.length + avisos.length, detalhes);
    if (logErr) avisos.push(`log falhou: ${logErr.message}`);
    return json(200, { ok: status === "sucesso", dry_run: false, status, ...detalhes });
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry_run) await log("erro", 0, 1, { agrupamento_id: agrupamentoId, erro: msg, colecoes_criadas: colecoesCriadas });
    return json(500, { ok: false, erro: msg });
  }
});
