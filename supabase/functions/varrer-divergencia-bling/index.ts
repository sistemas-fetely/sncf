// VARREDURA DE DIVERGÊNCIA SNCF × BLING (05/10/2026, F5 passo 1) — SÓ LEITURA.
// Nenhum PUT/POST/PATCH no Bling: apenas GET /produtos/{card canônico}.
// Campos comparados vêm de produto_campo_destino (sistema 'Bling'); conversão vem de
// _shared/bling/montar-valores-produto.ts (mesma regra da corrigir-produto-bling).
// Pagina e se re-encadeia no mesmo lote_id até terminar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { EXTRATORES_BLING, difere, txt } from "../_shared/bling/montar-valores-produto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const PAGINA = 150;
const SISTEMA = "Bling";

// deno-lint-ignore no-explicit-any
type Any = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const segredo = req.headers.get("x-cron-secret");
  if (!segredo) return json(401, { error: "x-cron-secret ausente." });
  const { data: esperado, error: segErr } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  if (segErr || !esperado || segredo !== esperado) return json(401, { error: "x-cron-secret inválido." });

  try {
    let body: Any = {};
    try { body = await req.json(); } catch { body = {}; }
    const skus: string[] = Array.isArray(body?.skus)
      ? [...new Set<string>(body.skus.map((s: unknown) => String(s).trim()).filter(Boolean))] : [];
    const limiteN = Number(body?.limite);
    const limite = Number.isFinite(limiteN) && limiteN > 0 ? Math.floor(limiteN) : null;
    const cursor: string | null = typeof body?.cursor === "string" ? body.cursor : null;
    let loteId: string | null = typeof body?.lote_id === "string" ? body.lote_id : null;

    // ---- lote ----
    if (!loteId) {
      loteId = crypto.randomUUID();
      const { error } = await sb.from("produto_destino_varredura").insert({
        lote_id: loteId, sistema: SISTEMA, modo: "detectar",
        produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0, detalhe_erros: [],
      });
      if (error) throw new Error(`criar lote: ${error.message}`);
    }

    // ---- de-para ----
    const { data: dePara, error: dpErr } = await sb.from("produto_campo_destino")
      .select("campo, campo_destino").eq("sistema", SISTEMA);
    if (dpErr) throw new Error(`produto_campo_destino: ${dpErr.message}`);
    const detalheErros: Any[] = [];
    const campos = (dePara ?? []).filter((d: Any) => {
      if (EXTRATORES_BLING[d.campo]) return true;
      if (!cursor) detalheErros.push({ sku: null, mensagem: `campo sem extrator: ${d.campo}` });
      return false;
    });

    // ---- página do universo ----
    const tamanho = limite === null ? PAGINA : Math.min(PAGINA, limite);
    let q = sb.from("vw_produto_conciliacao").select("sku, cod_cadastro, fase, bling_card_canonico")
      .not("bling_card_canonico", "is", null).order("sku").limit(tamanho);
    if (skus.length) q = q.in("sku", skus);
    if (cursor) q = q.gt("sku", cursor);
    const { data: universo, error: uErr } = await q;
    if (uErr) throw new Error(`vw_produto_conciliacao: ${uErr.message}`);
    const linhas = universo ?? [];

    let lidos = 0, comDiv = 0, divs = 0, erros = 0;
    if (linhas.length) {
      const lista = linhas.map((l: Any) => l.sku);
      const { data: fichas, error: fErr } = await sb.from("sncf_produtos")
        .select("sku, cod_cadastro, nome_operacional, preco_varejo, ean, dun, peso_g, largura_cm, altura_cm, profundidade_cm, ncm, cest, origem_fisc")
        .in("sku", lista);
      if (fErr) throw new Error(`sncf_produtos: ${fErr.message}`);
      const fichaPorSku = new Map((fichas ?? []).map((f: Any) => [f.sku, f]));
      const cods = [...new Set(linhas.map((l: Any) => l.cod_cadastro).filter(Boolean))];
      const inners = new Map<string, number>();
      if (cods.length) {
        const { data: cart, error: cErr } = await sb.from("cartorio_codigo").select("cod_cadastro, inner_qtd").in("cod_cadastro", cods);
        if (cErr) throw new Error(`cartorio_codigo: ${cErr.message}`);
        for (const c of cart ?? []) {
          if (c.cod_cadastro && c.inner_qtd !== null && Number(c.inner_qtd) >= 1 && !inners.has(c.cod_cadastro)) inners.set(c.cod_cadastro, Number(c.inner_qtd));
        }
      }

      const { data: cfg, error: cfgErr } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
      if (cfgErr) throw new Error(`config Bling: ${cfgErr.message}`);
      if (!cfg?.access_token) throw new Error("Bling não conectado");
      const client = makeBlingClient(sb, cfg as Any, await ensureFreshToken(sb, cfg as Any));

      for (let i = 0; i < linhas.length; i++) {
        const l: Any = linhas[i];
        if (i > 0) await sleep(THROTTLE_MS);
        lidos++;
        try {
          const ficha = fichaPorSku.get(l.sku);
          if (!ficha) throw new Error("sem ficha em sncf_produtos");
          const r = await client.get(`/produtos/${l.bling_card_canonico}`);
          const atual = r?.data;
          if (!atual?.id) throw new Error("GET /produtos retornou vazio ou sem id");
          const ctx = { ficha, fase: l.fase, inner: inners.get(l.cod_cadastro) ?? null };
          const novas: Any[] = [];
          for (const d of campos) {
            const exts = EXTRATORES_BLING[d.campo];
            exts.forEach((ex, k) => {
              const vs = ex.sncf(ctx), vb = ex.bling(atual);
              if (!difere(ex.tipo, vs, vb)) return;
              const destino = exts.length > 1 ? txt(d.campo_destino).split("+").map((s) => s.trim())[k] ?? d.campo_destino : d.campo_destino;
              novas.push({
                lote_id: loteId, sistema: SISTEMA, cod_cadastro: l.cod_cadastro, sku: l.sku,
                destino_id: String(l.bling_card_canonico), campo: d.campo, campo_destino: destino,
                valor_sncf: vs === null || vs === undefined || txt(vs) === "" ? null : txt(vs),
                valor_destino: vb === null || vb === undefined || txt(vb) === "" ? null : txt(vb),
              });
            });
          }
          if (novas.length) {
            const { error } = await sb.from("produto_destino_divergencia").insert(novas);
            if (error) throw new Error(`gravar divergência: ${error.message}`);
            comDiv++; divs += novas.length;
          }
        } catch (e) {
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
    const patch: Any = {
      produtos_lidos: (lote.produtos_lidos ?? 0) + lidos,
      produtos_com_divergencia: (lote.produtos_com_divergencia ?? 0) + comDiv,
      divergencias: (lote.divergencias ?? 0) + divs,
      erros: (lote.erros ?? 0) + erros,
      detalhe_erros: [...(lote.detalhe_erros ?? []), ...detalheErros],
    };
    if (acabou) patch.concluido_em = new Date().toISOString();
    const { error: upErr } = await sb.from("produto_destino_varredura").update(patch).eq("lote_id", loteId);
    if (upErr) throw new Error(`atualizar lote: ${upErr.message}`);

    if (!acabou) {
      const prox = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/varrer-divergencia-bling`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segredo },
        body: JSON.stringify({ lote_id: loteId, cursor: linhas[linhas.length - 1].sku, limite: restante, skus: skus.length ? skus : undefined }),
      }).catch((e) => console.error("re-encadear falhou", loteId, e));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(prox);
    }

    return json(200, { ok: true, lote_id: loteId, concluido: acabou, pagina: { lidos, com_divergencia: comDiv, divergencias: divs, erros }, lote: { ...lote, ...patch } });
  } catch (e) {
    return json(500, { ok: false, lote_id: null, error: e instanceof Error ? e.message : String(e) });
  }
});
