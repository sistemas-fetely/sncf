// B1 · Espelho dos anúncios do Mercado Livre via Bling (28/11/2026). Só GET no Bling.
// Cron (x-cron-secret) ou sessão com acao.marketplace.sincronizar (super admin passa). Loja vem de marketplace_loja_bling.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { BLING_BASE, blingHeaders, ensureFreshToken, refreshAccessToken } from "../_shared/bling/bling-client.ts";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { centavos, precisaDetalhe, resolverProduto, type Mapas } from "./resolver.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ORCAMENTO_MS = 110_000;

async function todos<T>(f: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await f(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const negado = await gateCronOuSessao(req, sb, corsHeaders);
  if (negado) return negado;
  if (!req.headers.get("x-cron-secret")) {
    const p = await exigirAcao(sb, req.headers.get("Authorization"), "acao.marketplace.sincronizar", "ler os anúncios do marketplace");
    if (!p.ok) return json({ ok: false, erro: p.erro }, p.status);
  }
  const corpo: any = await req.json().catch(() => ({}));
  const completo = corpo?.completo === true;

  const { data: lojas, error: el } = await sb.from("marketplace_loja_bling").select("loja_bling_id").eq("marketplace_codigo", "ML").eq("ativo", true);
  if (el) return json({ ok: false, erro: `marketplace_loja_bling: ${el.message}` }, 500);
  if (!lojas?.length) return json({ ok: false, erro: "Nenhuma loja Mercado Livre ativa em marketplace_loja_bling." }, 500);
  if (lojas.length > 1) return json({ ok: false, erro: `Mais de uma loja ML ativa (${lojas.map((l) => l.loja_bling_id).join(", ")}); o espelho lê uma loja.` }, 500);
  const idLoja = Number(lojas[0].loja_bling_id);

  const { data: exec, error: ee } = await sb.from("bling_anuncio_sync_execucao").insert({ loja_bling_id: idLoja, detalhes: { completo } }).select("id").single();
  if (ee) return json({ ok: false, erro: `execução: ${ee.message}` }, 500);
  const fechar = async (campos: Record<string, unknown>) => {
    const { error } = await sb.from("bling_anuncio_sync_execucao").update({ terminado_em: new Date().toISOString(), ...campos }).eq("id", exec.id);
    if (error) console.error("fechar execução", error.message);
  };

  try {
    const { data: cfg, error: ec } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
    if (ec || !cfg) throw new Error(`Config Bling: ${ec?.message ?? "ausente"}`);
    let token = await ensureFreshToken(sb, cfg as any);
    let ultima = 0;
    async function get(path: string): Promise<any> {
      for (let tent = 0; tent < 3; tent++) {
        const espera = 350 - (Date.now() - ultima); if (espera > 0) await dorme(espera); // ≤ 3 req/s
        ultima = Date.now();
        const r = await fetch(`${BLING_BASE}${path}`, { headers: blingHeaders(token) });
        if (r.status === 401 && tent === 0) { token = await refreshAccessToken(sb, { ...(cfg as any), access_token: token }); continue; }
        if (r.status === 429 || r.status >= 500) { await dorme(1200 * (tent + 1)); continue; }
        const b = await r.json().catch(() => null);
        if (!r.ok) throw new Error(`Bling ${r.status} em ${path}: ${JSON.stringify(b).slice(0, 500)}`);
        return b;
      }
      throw new Error(`Bling sem resposta útil em ${path} após 3 tentativas`);
    }

    // espelho atual + mapas de resolução
    const espelho = new Map<number, any>();
    for (const r of await todos<any>((de, ate) => sb.from("bling_anuncio").select("id,preco,situacao,titulo,qtd_imagens,sumiu_em,produto_bling_id").eq("loja_bling_id", idLoja).order("id").range(de, ate))) espelho.set(Number(r.id), r);
    const mapas: Mapas = { canonico: new Map(), cache: new Map(), sncf: new Map() };
    for (const r of await todos<any>((de, ate) => sb.from("bling_card_canonico").select("sku,bling_id").order("sku").range(de, ate))) mapas.canonico.set(String(r.bling_id), r.sku);
    for (const r of await todos<any>((de, ate) => sb.from("bling_produtos_cache").select("sku,bling_produto_id").order("sku").range(de, ate))) mapas.cache.set(String(r.bling_produto_id), r.sku);
    for (const r of await todos<any>((de, ate) => sb.from("sncf_produtos").select("sku,cod_cadastro,ativo").not("sku", "is", null).order("ativo", { ascending: true }).order("sku").range(de, ate))) {
      const p = { sku: r.sku, cod_cadastro: r.cod_cadastro };
      mapas.sncf.set(String(r.sku).toUpperCase(), p); // ativos por último → vencem
      if (r.cod_cadastro) mapas.sncf.set(String(r.cod_cadastro).toUpperCase(), p);
    }

    // listagem
    const q = `idLoja=${idLoja}&tipoIntegracao=MercadoLivre`;
    const lista: any[] = [];
    for (let pagina = 1; pagina <= 100; pagina++) {
      const b = await get(`/anuncios?${q}&pagina=${pagina}&limite=100`);
      const arr = Array.isArray(b?.data) ? b.data : [];
      lista.push(...arr);
      if (arr.length < 100) break;
    }

    let novos = 0, alterados = 0, detalhados = 0, pendentesDetalhe = 0;
    const agora = new Date().toISOString();
    const linhas: any[] = [];
    for (const it of lista) {
      const id = Number(it.id); const esp = espelho.get(id);
      const quer = precisaDetalhe(it, esp, completo) || esp?.qtd_imagens == null;
      let d: any = null;
      if (quer) {
        if (Date.now() - t0 < ORCAMENTO_MS) { d = (await get(`/anuncios/${id}?${q}`))?.data ?? null; detalhados++; }
        else pendentesDetalhe++;
      }
      const f = d ?? it;
      // a listagem não traz o produto: sem detalhe nesta rodada, vale o produto já guardado
      const produtoId = f?.produto?.id ?? it?.produto?.id ?? esp?.produto_bling_id ?? null;
      const prod = resolverProduto(produtoId, mapas);
      const linha: any = {
        id, loja_bling_id: idLoja, marketplace_codigo: "ML",
        anuncio_loja_id: f?.anuncioLoja?.id ?? it?.anuncioLoja?.id ?? null,
        titulo: it?.titulo ?? f?.titulo ?? f?.nome ?? null, situacao: it?.situacao ?? f?.situacao ?? null, status: f?.status ?? it?.status ?? null,
        // na listagem `preco` vem como número; no detalhe, { valor, promocional }
        preco: centavos(typeof it?.preco === "object" ? it?.preco?.valor : it?.preco) ?? centavos(f?.preco?.valor),
        produto_bling_id: produtoId, sku: prod?.sku ?? null, cod_cadastro: prod?.cod_cadastro ?? null,
        visto_em: agora, sumiu_em: null, atualizado_em: agora,
      };
      if (d) Object.assign(linha, {
        descricao: d.descricao ?? null, preco_promocional: centavos(d.preco?.promocional), atributos: d.atributos ?? null, imagens: d.imagens ?? null, variacoes: d.variacoes ?? null, payload: d,
        qtd_imagens: (d.imagens ?? []).length, qtd_atributos: (d.atributos ?? []).length, qtd_variacoes: (d.variacoes ?? []).length,
      });
      if (!esp) novos++;
      else if (esp.sumiu_em || centavos(esp.preco) !== linha.preco || esp.situacao !== linha.situacao || esp.titulo !== linha.titulo) alterados++;
      linhas.push(linha);
    }
    // upsert em dois grupos (com e sem detalhe) para não apagar o detalhe guardado
    for (const grupo of [linhas.filter((l) => "payload" in l), linhas.filter((l) => !("payload" in l))]) {
      for (let i = 0; i < grupo.length; i += 200) {
        const { error } = await sb.from("bling_anuncio").upsert(grupo.slice(i, i + 200), { onConflict: "id" });
        if (error) throw new Error(`upsert bling_anuncio: ${error.message}`);
      }
    }
    const vistos = new Set(linhas.map((l) => l.id));
    const sumidos = [...espelho.values()].filter((e) => !e.sumiu_em && !vistos.has(Number(e.id))).map((e) => e.id);
    if (sumidos.length) {
      const { error } = await sb.from("bling_anuncio").update({ sumiu_em: agora, atualizado_em: agora }).in("id", sumidos);
      if (error) throw new Error(`marcar sumidos: ${error.message}`);
    }
    const motivos: Record<string, number> = {};
    for (const l of linhas) { const e = espelho.get(l.id); if (!e) continue; if (centavos(e.preco) !== l.preco) motivos.preco = (motivos.preco ?? 0) + 1; if (e.situacao !== l.situacao) motivos.situacao = (motivos.situacao ?? 0) + 1; if (e.titulo !== l.titulo) motivos.titulo = (motivos.titulo ?? 0) + 1; }
    const detalhes = { motivos_alteracao: motivos, chaves_listagem: Object.keys(lista[0] ?? {}), completo, detalhados, pendentes_detalhe: pendentesDetalhe, ms: Date.now() - t0 };
    await fechar({ total_lidos: lista.length, total_novos: novos, total_alterados: alterados, total_sumidos: sumidos.length, detalhes });
    return json({ ok: true, execucao_id: exec.id, loja_bling_id: idLoja, total_lidos: lista.length, total_novos: novos, total_alterados: alterados, total_sumidos: sumidos.length, ...detalhes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await fechar({ erro: msg, detalhes: { completo, ms: Date.now() - t0 } });
    return json({ ok: false, execucao_id: exec.id, erro: msg }, 500);
  }
});
