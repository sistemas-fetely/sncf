// VARRER-DIVERGENCIA-ESPELHO (20/10/2026, Flavio)
// "Detectar" de XPM/Shopify enquanto não há varredura própria no molde do Bling.
// Não compara nada: (1) chama o sync que atualiza o espelho de cadastro e
// (2) conta as divergências na fila (vw_conciliacao_fila, regra *_cadastro_difere).
//   XPM     → zenlog-sync-estoque { tipo: "produtos" }   (espelho xpm_produtos_cache)
//   Shopify → shopify-catalogo-pull {}                   (espelho shopify_variante/peso)
// Porta: x-cron-secret OU usuário com tem_permissao('acao.varrer_bling').
// O lote nasce na hora (iniciado_em) e é concluído em segundo plano.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const CONFIG = {
  XPM: { edge: "zenlog-sync-estoque", body: { tipo: "produtos" }, filaSistema: "xpm", regra: "xpm_cadastro_difere" },
  Shopify: { edge: "shopify-catalogo-pull", body: {}, filaSistema: "shopify", regra: "shopify_cadastro_difere" },
} as const;
type Sistema = keyof typeof CONFIG;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil: (p: Promise<any>) => void };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const sb = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: segredo, error: sErr } = await sb.rpc("get_vault_secret", { p_name: "SYNC_CRON_SECRET" });
  if (sErr || !segredo) return json(500, { error: `Segredo do cron indisponível: ${sErr?.message ?? "vazio"}` });
  const recebido = req.headers.get("x-cron-secret");
  if (recebido) {
    if (recebido !== segredo) return json(401, { error: "x-cron-secret inválido." });
  } else {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json(403, { error: "Sem x-cron-secret e sem sessão." });
    const { data: u, error: uErr } = await sb.auth.getUser(auth.slice(7).trim());
    if (uErr || !u?.user) return json(401, { error: "Sessão inválida." });
    const { data: pode, error: pErr } = await sb.rpc("tem_permissao", { p_slug: "acao.varrer_bling", p_user: u.user.id });
    if (pErr) return json(500, { error: `tem_permissao: ${pErr.message}` });
    if (!pode) return json(403, { error: "Sem permissão: acao.varrer_bling" });
  }

  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }
  const sistema = body?.sistema as Sistema;
  if (!(sistema in CONFIG)) return json(400, { error: "sistema deve ser 'XPM' ou 'Shopify'." });
  const cfg = CONFIG[sistema];

  const { data: lote, error: lErr } = await sb.from("produto_destino_varredura")
    .insert({ sistema, modo: "detectar", produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0 })
    .select("lote_id").single();
  if (lErr) return json(500, { error: `Criar lote: ${lErr.message}` });
  const loteId = lote.lote_id as string;

  const trabalho = (async () => {
    let lidos = 0;
    const erros: { etapa: string; mensagem: string }[] = [];
    try {
      const r = await fetch(`${url}/functions/v1/${cfg.edge}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": String(segredo) },
        body: JSON.stringify(cfg.body),
      });
      const texto = await r.text();
      // deno-lint-ignore no-explicit-any
      let res: any = null;
      try { res = JSON.parse(texto); } catch { res = { bruto: texto.slice(0, 500) }; }
      if (!r.ok || res?.ok === false || res?.error) {
        erros.push({ etapa: cfg.edge, mensagem: res?.error ?? res?.erro ?? `HTTP ${r.status}: ${texto.slice(0, 300)}` });
      }
      lidos = Number(sistema === "XPM" ? res?.itens : res?.variantes_totais ?? res?.produtos_gravados) || 0;
    } catch (e) {
      erros.push({ etapa: cfg.edge, mensagem: (e as Error).message });
    }

    // Fonte das divergências = a fila (nada reimplementado aqui).
    const skus = new Set<string>();
    let divergencias = 0;
    const porCampo: Record<string, number> = {};
    try {
      for (let de = 0; ; de += 1000) {
        const { data, error } = await sb.from("vw_conciliacao_fila")
          .select("linha_id, sku, campo_matriz, qtd_divergencias")
          .eq("sistema", cfg.filaSistema).eq("regra", cfg.regra)
          .order("linha_id").range(de, de + 999);
        if (error) throw new Error(`vw_conciliacao_fila: ${error.message}`);
        for (const l of data ?? []) {
          if (l.sku) skus.add(l.sku);
          const n = Number(l.qtd_divergencias ?? 1) || 1;
          divergencias += n;
          for (const c of String(l.campo_matriz ?? "cadastro").split(/\s*[·,;]\s*/).filter(Boolean)) {
            porCampo[c] = (porCampo[c] ?? 0) + 1;
          }
        }
        if ((data ?? []).length < 1000) break;
      }
    } catch (e) {
      erros.push({ etapa: "fila", mensagem: (e as Error).message });
    }

    const { error: uErr } = await sb.from("produto_destino_varredura").update({
      concluido_em: new Date().toISOString(),
      produtos_lidos: lidos,
      produtos_com_divergencia: skus.size,
      divergencias,
      erros: erros.length,
      detalhe_erros: { fonte: "espelho", sync: cfg.edge, por_campo: porCampo, erros },
    }).eq("lote_id", loteId);
    if (uErr) console.error(`[varrer-divergencia-espelho] concluir lote ${loteId}: ${uErr.message}`);
  })();
  EdgeRuntime.waitUntil(trabalho);

  return json(200, { ok: true, lote_id: loteId, sistema });
});
