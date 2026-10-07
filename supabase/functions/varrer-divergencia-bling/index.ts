// VARREDURA DE DIVERGÊNCIA SNCF × BLING (05/10/2026, F5 passos 1 e 2).
// modo "detectar" (padrão): só GET /produtos/{card canônico}, nenhuma escrita no Bling.
// modo "corrigir": parte do GET do próprio card, troca SÓ os campos com
// produto_campo_destino.sobrescreve = true que divergem, e faz PUT do card inteiro.
// Campos comparados vêm de produto_campo_destino (sistema 'Bling'); conversão vem de
// _shared/bling/montar-valores-produto.ts (mesma regra da corrigir-produto-bling).
// Pagina e se re-encadeia no mesmo lote_id até terminar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { BLING_BASE, ensureFreshToken, makeBlingClient, refreshAccessToken } from "../_shared/bling/bling-client.ts";
import { EXTRATORES_BLING, difere, num, txt } from "../_shared/bling/montar-valores-produto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const THROTTLE_MS = 350;
const PAGINA = 150;
const PAGINA_CORRIGIR = 60;
const SISTEMA = "Bling";

// deno-lint-ignore no-explicit-any
type Any = any;

// No Bling, número opcional "não preenchido" vem como 0: 0 e vazio são equivalentes (preço continua estrito).
const OPCIONAIS_ZERO_VAZIO = new Set(["inner_qtd", "peso_g", "altura_cm", "largura_cm", "profundidade_cm"]);
const zeroOuVazio = (v: unknown) => v === null || v === undefined || txt(v) === "" || Number(v) === 0;

// Como gravar cada campo no card do Bling. QUAIS campos são gravados decide o banco (sobrescreve).
const APLICAR_NO_CARD: Record<string, (card: Any, v: unknown) => void> = {
  dun: (c, v) => { c.gtinEmbalagem = txt(v); },
  fase: (c, v) => { c.situacao = txt(v); },
  preco_varejo: (c, v) => { c.preco = num(v); },
};

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
    const modo: "detectar" | "corrigir" = body?.modo === "corrigir" ? "corrigir" : "detectar";
    const corrigir = modo === "corrigir";
    const dryRun = corrigir && body?.dry_run === true;
    const pulados: Any[] = [];
    const planejado: Any[] = [];

    // ---- lote ----
    if (!loteId) {
      loteId = crypto.randomUUID();
      const { error } = await sb.from("produto_destino_varredura").insert({
        lote_id: loteId, sistema: SISTEMA, modo,
        produtos_lidos: 0, produtos_com_divergencia: 0, divergencias: 0, erros: 0,
        detalhe_erros: corrigir ? { dry_run: dryRun, corrigidos: 0, planejados: 0, pulados: [], erros: [] } : [],
      });
      if (error) throw new Error(`criar lote: ${error.message}`);
    }

    // ---- de-para (interruptor sobrescreve vem do banco) ----
    const { data: dePara, error: dpErr } = await sb.from("produto_campo_destino")
      .select("campo, campo_destino, sobrescreve").eq("sistema", SISTEMA);
    if (dpErr) throw new Error(`produto_campo_destino: ${dpErr.message}`);
    const detalheErros: Any[] = [];
    const campos = (dePara ?? []).filter((d: Any) => {
      if (EXTRATORES_BLING[d.campo]) return true;
      if (!cursor && !corrigir) detalheErros.push({ sku: null, mensagem: `campo sem extrator: ${d.campo}` });
      return false;
    });

    // ---- página do universo ----
    const pag = corrigir ? PAGINA_CORRIGIR : PAGINA;
    const tamanho = limite === null ? pag : Math.min(pag, limite);
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
      let token = client.currentToken();


      // Freio de formato (só no modo corrigir): campo -> motivo por cod_cadastro.
      const violacoes = new Map<string, string>();
      if (corrigir && cods.length) {
        const { data: alertas, error: aErr } = await sb.from("vw_produto_formato_alerta")
          .select("cod_cadastro, campo, motivo").in("cod_cadastro", cods);
        if (aErr) throw new Error(`vw_produto_formato_alerta: ${aErr.message}`);
        for (const a of alertas ?? []) violacoes.set(`${a.cod_cadastro}|${a.campo}`, txt(a.motivo));
      }

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
          const card: Any = corrigir ? structuredClone(atual) : null;
          for (const d of campos) {
            const exts = EXTRATORES_BLING[d.campo];
            exts.forEach((ex, k) => {
              const vs = ex.sncf(ctx), vb = ex.bling(atual);
              if (OPCIONAIS_ZERO_VAZIO.has(d.campo) && (zeroOuVazio(vs) && zeroOuVazio(vb))) return;
              if (!difere(ex.tipo, vs, vb)) return;
              const destino = exts.length > 1 ? txt(d.campo_destino).split("+").map((s) => s.trim())[k] ?? d.campo_destino : d.campo_destino;
              const linha = {
                lote_id: loteId, sistema: SISTEMA, cod_cadastro: l.cod_cadastro, sku: l.sku,
                destino_id: String(l.bling_card_canonico), campo: d.campo, campo_destino: destino,
                valor_sncf: vs === null || vs === undefined || txt(vs) === "" ? null : txt(vs),
                valor_destino: vb === null || vb === undefined || txt(vb) === "" ? null : txt(vb),
              };
              if (!corrigir) { novas.push(linha); return; }
              if (d.sobrescreve !== true) return;
              const motivoFmt = violacoes.get(`${l.cod_cadastro}|${d.campo}`);
              if (motivoFmt !== undefined) { pulados.push({ sku: l.sku, campo: d.campo, motivo: `formato inválido — ${motivoFmt}` }); return; }
              if (linha.valor_sncf === null) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "SNCF vazio" }); return; }
              const setter = APLICAR_NO_CARD[d.campo];
              if (!setter) { pulados.push({ sku: l.sku, campo: d.campo, motivo: "sem regra de escrita no card" }); return; }
              setter(card, vs);
              novas.push(linha);
            });
          }
          if (corrigir && novas.length) {
            if (dryRun) {
              for (const n of novas) planejado.push({ sku: l.sku, campo: n.campo, de: n.valor_destino, para: n.valor_sncf });
            } else {
              await sleep(THROTTLE_MS);
              await putCard(String(l.bling_card_canonico), card);
              const { error } = await sb.from("produto_destino_divergencia").insert(novas);
              if (error) throw new Error(`gravar sobrescrita: ${error.message}`);
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

      // PUT do card inteiro (partindo do GET). 401 renova uma vez; 429/5xx: 1s, 2s, 4s.
      async function putCard(id: string, corpo: Any, tentativa = 0): Promise<void> {
        const res = await fetch(`${BLING_BASE}/produtos/${id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        if (res.status === 401 && tentativa === 0) {
          token = await refreshAccessToken(sb, { ...(cfg as Any), access_token: token });
          return putCard(id, corpo, tentativa + 1);
        }
        if ((res.status === 429 || res.status >= 500) && tentativa < 3) {
          await sleep(1000 * Math.pow(2, tentativa));
          return putCard(id, corpo, tentativa + 1);
        }
        if (!res.ok) throw new Error(`Bling PUT ${res.status}: ${(await res.text()).slice(0, 500)}`);
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
      const prox = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/varrer-divergencia-bling`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": segredo },
        body: JSON.stringify({ lote_id: loteId, cursor: linhas[linhas.length - 1].sku, limite: restante, skus: skus.length ? skus : undefined, modo, dry_run: dryRun }),
      }).catch((e) => console.error("re-encadear falhou", loteId, e));
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(prox);
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
