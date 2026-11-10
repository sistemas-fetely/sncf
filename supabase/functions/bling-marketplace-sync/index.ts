// Edge: bling-marketplace-sync (10/11/2026, mapa-pedidos-marketplace-v1 F0)
// Pedido de marketplace nasce no Bling (TikTok Shop / Mercado Livre / Shopee).
// Esta edge: (a) acao "lojas" — lista GET /canais-venda e sincroniza marketplace_loja_bling
// por tipo; (b) acao "pedidos" (padrao/cron) — para cada canal de marketplace ativo, lista
// pedidos recentes, busca o detalhe e chama fn_nascer_pedido_marketplace.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { BlingHttpError, ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { resolverParceiroBling } from "../_shared/bling/parceiro-resolver.ts";

const cors = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-cron-secret`,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errMsg = (e: unknown) => {
  if (e instanceof BlingHttpError) {
    let c: any = null; try { c = e.corpo ? JSON.parse(e.corpo) : null; } catch { c = { texto: String(e.corpo).slice(0, 500) }; }
    return `Bling ${e.status}: ${c?.error?.message ?? c?.message ?? c?.texto ?? JSON.stringify(c)}`;
  }
  return e instanceof Error ? e.message : String(e);
};
function isoDiasAtras(d: number) { const x = new Date(Date.now() - d * 86400_000); return x.toISOString().slice(0, 10); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, erro: "Configuração do ambiente ausente." }, 500);
  const sb = createClient(supabaseUrl, serviceRoleKey);
  const negado = await gateCronOuSessao(req, sb, cors);
  if (negado) return negado;

  let body: any = {}; try { body = await req.json(); } catch { body = {}; }
  const acao: string = body?.acao ?? "pedidos";
  const diasJanela: number = Number(body?.dias ?? 7);

  const { data: cfg, error: eCfg } = await sb.from("integracoes_config").select("*").eq("sistema", "bling").maybeSingle();
  if (eCfg || !cfg) return json({ ok: false, erro: `Configuração do Bling: ${eCfg?.message ?? "ausente"}` }, 500);
  if (!cfg.access_token) return json({ ok: false, erro: "Bling não conectado." }, 409);
  const client = makeBlingClient(sb, cfg as any, await ensureFreshToken(sb, cfg as any));

  // ---------- acao: lojas ----------
  if (acao === "lojas") {
    let lojas: any[] = [];
    try { const r = await client.get(`/canais-venda?limite=100&pagina=1`); lojas = r?.data ?? []; }
    catch (e) { return json({ ok: false, erro: errMsg(e) }, 502); }
    const casados: unknown[] = [];
    const codigos = new Map<string, string>([["TikTok", "TTS"], ["MercadoLivre", "MLB"], ["Shopee", "SHP"]]);
    for (const canal of lojas) {
      const codigo = codigos.get(canal.tipo);
      if (!codigo) continue;
      const lojaId = Number(canal.id);
      const { data: existente, error: eBusca } = await sb.from("marketplace_loja_bling")
        .select("loja_bling_id").eq("loja_bling_id", lojaId).maybeSingle();
      if (eBusca) return json({ ok: false, erro: `marketplace_loja_bling: ${eBusca.message}`, marketplace: casados }, 500);
      // ativo fica fora do UPSERT: usa o default no insert e preserva a escolha existente no update.
      const { error } = await sb.from("marketplace_loja_bling").upsert([{
        loja_bling_id: lojaId, marketplace_codigo: codigo, descricao: canal.descricao ?? canal.nome,
        tipo_bling: canal.tipo,
      }], { onConflict: "loja_bling_id", defaultToNull: false });
      if (error) return json({ ok: false, erro: `marketplace_loja_bling: ${error.message}`, marketplace: casados }, 500);
      casados.push({ codigo, loja_bling_id: lojaId, nome_bling: canal.descricao ?? canal.nome, origem: existente ? "atualizado" : "inserido" });
    }
    return json({ ok: true, lojas_bling: lojas.map((l) => ({ id: l.id, descricao: l.descricao ?? l.nome, tipo: l.tipo })), marketplace: casados });
  }

  // ---------- acao: detalhe (diagnóstico, sem gravação) ----------
  if (acao === "detalhe") {
    const blingId = body?.bling_pedido_id;
    if (typeof blingId !== "string" || !blingId.trim()) return json({ ok: false, erro: "bling_pedido_id obrigatório." }, 400);
    try {
      const det = (await client.get(`/pedidos/vendas/${encodeURIComponent(blingId.trim())}`))?.data;
      return json({ ok: true, data: det });
    } catch (e) { return json({ ok: false, erro: errMsg(e) }, 502); }
  }

  // ---------- acao: etiqueta (diagnóstico, sem gravação) ----------
  if (acao === "etiqueta") {
    const blingId = body?.bling_pedido_id;
    if (typeof blingId !== "string" || !blingId.trim()) return json({ ok: false, erro: "bling_pedido_id obrigatório." }, 400);
    const query = `idsVendas%5B%5D=${encodeURIComponent(blingId.trim())}`;
    let resultado: Record<string, unknown>;
    let status = 200;
    try {
      resultado = { ok: true, data: await client.get(`/logisticas/etiquetas?${query}`) };
    } catch (e) {
      resultado = { ok: false, erro: errMsg(e), ...(e instanceof BlingHttpError ? { corpo: e.corpo } : {}) };
      status = 502;
    }
    try {
      resultado.objetos = await client.get(`/logisticas/objetos?${query}`);
    } catch (e) {
      resultado.objetos_erro = errMsg(e);
    }
    return json(resultado, status);
  }

  // ---------- acao: pedidos ----------
  if (acao !== "pedidos") return json({ ok: false, erro: `acao desconhecida: ${acao}` }, 400);
  const { data: mkts, error: eM } = await sb.from("marketplace_loja_bling")
    .select("loja_bling_id, marketplace_codigo, descricao, marketplace_loja!inner(codigo, nome, ativo)")
    .eq("ativo", true).eq("marketplace_loja.ativo", true);
  if (eM) return json({ ok: false, erro: `marketplace_loja_bling: ${eM.message}` }, 500);
  if (!(mkts ?? []).length) return json({ ok: true, aviso: "nenhuma loja de marketplace com loja_bling_id — rode acao=lojas", processados: 0 });

  const resumo = { listados: 0, novos: 0, criados: 0, ja_existiam: 0, ignorados: 0, erros: 0, detalhes: [] as unknown[] };
  const inicio = Date.now();
  const dataInicial = isoDiasAtras(diasJanela);

  for (const m of mkts ?? []) {
    let pagina = 1;
    while (Date.now() - inicio < 50_000) {
      let lista: any[] = [];
      try {
        const r = await client.get(`/pedidos/vendas?limite=100&pagina=${pagina}&idLoja=${m.loja_bling_id}&dataInicial=${dataInicial}`);
        lista = r?.data ?? [];
      } catch (e) { resumo.erros++; resumo.detalhes.push({ loja: m.marketplace_codigo, pagina, erro: errMsg(e) }); break; }
      if (!lista.length) break;
      resumo.listados += lista.length;

      for (const p of lista) {
        if (Date.now() - inicio > 50_000) break;
        const blingId = String(p.id);
        const { data: fila } = await sb.from("bling_pedido_fila_mkt").select("id, status, tentativas").eq("bling_pedido_id", blingId).maybeSingle();
        if (fila && (fila.status === "concluido" || fila.status === "ignorado")) continue;
        if (fila && fila.status === "erro" && Number(fila.tentativas ?? 0) >= 5) continue;
        resumo.novos++;

        let filaId = fila?.id as string | undefined;
        if (!filaId) {
          const { data: ins, error: eIns } = await sb.from("bling_pedido_fila_mkt").insert({
            bling_pedido_id: blingId, bling_numero: p.numero ? String(p.numero) : null, numero_loja: p.numeroLoja ?? null,
            loja_bling_id: m.loja_bling_id, marketplace_codigo: m.marketplace_codigo, situacao_bling: p.situacao ?? null, status: "processando",
          }).select("id").maybeSingle();
          if (eIns || !ins) { resumo.erros++; resumo.detalhes.push({ bling_id: blingId, erro: `fila insert: ${eIns?.message}` }); continue; }
          filaId = ins.id;
        } else {
          await sb.from("bling_pedido_fila_mkt").update({ status: "processando" }).eq("id", filaId);
        }

        try {
          const det = (await client.get(`/pedidos/vendas/${encodeURIComponent(blingId)}`))?.data;
          if (!det) throw new Error("detalhe vazio");
          // Parceiro: resolver unico (bling_id -> CPF -> CNPJ), fonte unica em parceiro-resolver.ts
          let parceiroId: string | null = null;
          try { parceiroId = await resolverParceiroBling(sb, det.contato, "api_bling"); } catch { parceiroId = null; }
          const { data: r, error: eRpc } = await sb.rpc("fn_nascer_pedido_marketplace", { p_raw: det, p_parceiro_id: parceiroId, p_dry_run: false });
          if (eRpc) throw new Error(`fn_nascer_pedido_marketplace: ${eRpc.message}`);
          const acaoR = r?.acao;
          const status = acaoR === "criado" ? "concluido" : acaoR === "ja_existe" ? "concluido" : acaoR === "ignorado" ? "ignorado" : "erro";
          if (acaoR === "criado") resumo.criados++; else if (acaoR === "ja_existe") resumo.ja_existiam++; else if (acaoR === "ignorado") resumo.ignorados++;
          await sb.from("bling_pedido_fila_mkt").update({
            status, pedido_id: r?.pedido_id ?? null, raw: det, situacao_bling: det.situacao ?? null,
            ultimo_erro: status === "erro" ? JSON.stringify(r).slice(0, 500) : null,
            tentativas: Number(fila?.tentativas ?? 0) + 1, processado_em: new Date().toISOString(),
          }).eq("id", filaId);
          resumo.detalhes.push({ loja: m.marketplace_codigo, bling_id: blingId, resultado: r });
        } catch (e) {
          const msg = errMsg(e);
          resumo.erros++;
          await sb.from("bling_pedido_fila_mkt").update({ status: "erro", ultimo_erro: msg, tentativas: Number(fila?.tentativas ?? 0) + 1, processado_em: new Date().toISOString() }).eq("id", filaId);
          resumo.detalhes.push({ loja: m.marketplace_codigo, bling_id: blingId, erro: msg });
        }
        await sleep(250);
      }
      if (lista.length < 100) break;
      pagina++;
      await sleep(300);
    }
  }
  return json({ ok: resumo.erros === 0, ...resumo });
});