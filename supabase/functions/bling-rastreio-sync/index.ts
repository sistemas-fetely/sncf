// bling-rastreio-sync: busca o codigo de rastreio SRO dos pedidos B2B em transporte
// via Correios, lendo a etiqueta PDF gerada na integracao de logistica do Bling.
//
// Fluxo por pedido:
//   1. GET /logisticas/etiquetas?formato=PDF&idsVendas[]={bling_pedido_id}
//   2. 404 / lista vazia -> pula (pedido sem etiqueta na integracao Correios do Bling)
//   3. Baixa o PDF (URL assinada, sem auth) e extrai o texto
//   4. Regex SRO: [A-Z]{2}\d{9}BR -> chama fn_registrar_rastreio_pedido (valida + upsert)
//
// Rate limit Bling: 3 req/s -> ~450ms de espera entre chamadas.
// Auth: x-cron-secret (pg_cron) contra get_vault_secret('SYNC_CRON_SECRET'),
//       ou usuario autenticado (disparo manual).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { extractText } from "npm:unpdf@1";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
const ESPERA_ENTRE_CHAMADAS_MS = 450;
const LIMITE_PADRAO = 30; // guardrail de tempo de execucao (cada pedido ~1-3s)

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Resultado = {
  pedido_id: string;
  bling_pedido_id: string | null;
  resultado: "registrado" | "sem_etiqueta" | "sem_codigo" | "erro";
  codigo: string | null;
  detalhe: string | null;
};

/** Extrai o codigo SRO do texto da etiqueta. Ignora espacos/quebras que o
 *  parser de PDF pode injetar entre caracteres. */
function acharCodigoSro(texto: string): string | null {
  const compacto = texto.toUpperCase().replace(/\s+/g, "");
  const m = compacto.match(/[A-Z]{2}\d{9}BR/);
  return m ? m[0] : null;
}

/** Servico Correios a partir do texto da etiqueta (valores alinhados ao que
 *  ja existe em pedido_rastreamento.servico). */
function detectarServico(texto: string): string | null {
  const t = texto.toUpperCase();
  if (t.includes("SEDEX")) return "SEDEX";
  if (/\bPAC\b/.test(t)) return "ENCOMENDA PAC";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function urlPdfDaEtiqueta(resp: any): string | null {
  const lista = Array.isArray(resp?.data) ? resp.data : [];
  for (const item of lista) {
    const cand = item?.link ?? item?.url ?? item?.pdf ?? null;
    if (typeof cand === "string" && cand.startsWith("http")) return cand;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Auth: x-cron-secret (cron) OU usuario autenticado (disparo manual)
  const cronSecret = req.headers.get("x-cron-secret");
  let autorizado = false;
  if (cronSecret) {
    const { data: expected } = await supabase.rpc("get_vault_secret", {
      p_name: "SYNC_CRON_SECRET",
    });
    if (expected && cronSecret === String(expected)) autorizado = true;
  }
  if (!autorizado) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await userClient.auth.getUser();
      if (data?.user) autorizado = true;
    }
  }
  if (!autorizado) {
    return new Response(JSON.stringify({ erro: "Não autorizado" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limite = Number.isFinite(body?.limite) && body.limite > 0
      ? Math.min(Number(body.limite), 100)
      : LIMITE_PADRAO;

    // 1. Transportadora "Correios" em parceiros_comerciais
    const { data: correios, error: errCorr } = await supabase
      .from("parceiros_comerciais")
      .select("id")
      .or("nome_fantasia.ilike.%correio%,razao_social.ilike.%correio%");
    if (errCorr) throw new Error(`erro ao localizar transportadora Correios: ${errCorr.message}`);
    const correiosIds = (correios ?? []).map((r: { id: string }) => r.id);
    if (correiosIds.length === 0) {
      return new Response(
        JSON.stringify({ erro: "Nenhum parceiro 'Correios' encontrado em parceiros_comerciais" }),
        { status: 409, headers: jsonHeaders },
      );
    }

    // 2. Remessas com bling_pedido_id de pedidos B2B em transporte via Correios
    const { data: remessas, error: errRem } = await supabase
      .from("pedido_remessa")
      .select("pedido_id, bling_pedido_id, pedidos!inner(id, canal, estagio, transportadora_id)")
      .not("bling_pedido_id", "is", null)
      .eq("pedidos.canal", "B2B")
      .eq("pedidos.estagio", "em_transporte")
      .in("pedidos.transportadora_id", correiosIds);
    if (errRem) throw new Error(`erro ao buscar remessas: ${errRem.message}`);

    // 3. Excluir pedidos que ja tem rastreio registrado
    const pedidoIds = [...new Set((remessas ?? []).map((r: { pedido_id: string }) => r.pedido_id))];
    let jaResolvidos = new Set<string>();
    if (pedidoIds.length > 0) {
      const { data: rastreios, error: errRas } = await supabase
        .from("pedido_rastreamento")
        .select("pedido_id")
        .in("pedido_id", pedidoIds);
      if (errRas) throw new Error(`erro ao buscar rastreios existentes: ${errRas.message}`);
      jaResolvidos = new Set((rastreios ?? []).map((r: { pedido_id: string }) => r.pedido_id));
    }

    // Agrupa bling_pedido_id por pedido (pedido pode ter mais de uma remessa)
    const porPedido = new Map<string, string[]>();
    for (const r of remessas ?? []) {
      if (jaResolvidos.has(r.pedido_id)) continue;
      const lista = porPedido.get(r.pedido_id) ?? [];
      if (r.bling_pedido_id && !lista.includes(r.bling_pedido_id)) lista.push(r.bling_pedido_id);
      porPedido.set(r.pedido_id, lista);
    }

    const pendentes = [...porPedido.entries()].slice(0, limite);
    if (pendentes.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, candidatos: pedidoIds.length, processados: 0, resultados: [] }),
        { status: 200, headers: jsonHeaders },
      );
    }

    // 4. Cliente Bling
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) {
      return new Response(JSON.stringify({ erro: "Bling não conectado" }), {
        status: 409,
        headers: jsonHeaders,
      });
    }
    const freshToken = await ensureFreshToken(supabase, cfg);
    const bling = makeBlingClient(supabase, cfg, freshToken);

    // 5. Processa pedido a pedido, respeitando rate limit
    const resultados: Resultado[] = [];
    let primeiraChamada = true;

    for (const [pedidoId, blingIds] of pendentes) {
      let resolvido = false;

      for (const blingId of blingIds) {
        if (!primeiraChamada) await dormir(ESPERA_ENTRE_CHAMADAS_MS);
        primeiraChamada = false;

        let pdfUrl: string | null = null;
        try {
          const resp = await bling.get(`/logisticas/etiquetas?formato=PDF&idsVendas[]=${blingId}`);
          pdfUrl = urlPdfDaEtiqueta(resp);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes("Bling 404")) {
            // pedido sem etiqueta na integracao — normal, pula
            resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "sem_etiqueta", codigo: null, detalhe: null });
            continue;
          }
          console.error(`[bling-rastreio-sync] erro Bling pedido ${pedidoId} (bling ${blingId}): ${msg}`);
          resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "erro", codigo: null, detalhe: msg.slice(0, 300) });
          continue;
        }

        if (!pdfUrl) {
          resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "sem_etiqueta", codigo: null, detalhe: "resposta sem link de PDF" });
          continue;
        }

        try {
          const pdfResp = await fetch(pdfUrl);
          if (!pdfResp.ok) throw new Error(`download do PDF falhou (${pdfResp.status})`);
          const bytes = new Uint8Array(await pdfResp.arrayBuffer());
          const extraido = await extractText(bytes, { mergePages: true });
          const texto = Array.isArray(extraido?.text)
            ? extraido.text.join("\n")
            : String(extraido?.text ?? "");

          const codigo = acharCodigoSro(texto);
          if (!codigo) {
            console.warn(`[bling-rastreio-sync] etiqueta sem codigo SRO: pedido ${pedidoId} (bling ${blingId})`);
            resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "sem_codigo", codigo: null, detalhe: null });
            continue;
          }

          const servico = detectarServico(texto);
          const { error: errRpc } = await supabase.rpc("fn_registrar_rastreio_pedido", {
            p_pedido_id: pedidoId,
            p_codigo_rastreio: codigo,
            p_servico: servico,
          });
          if (errRpc) throw new Error(`fn_registrar_rastreio_pedido: ${errRpc.message}`);

          resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "registrado", codigo, detalhe: servico });
          resolvido = true;
          break; // achou — nao precisa tentar as outras remessas do pedido
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[bling-rastreio-sync] erro PDF/RPC pedido ${pedidoId} (bling ${blingId}): ${msg}`);
          resultados.push({ pedido_id: pedidoId, bling_pedido_id: blingId, resultado: "erro", codigo: null, detalhe: msg.slice(0, 300) });
        }
      }

      if (!resolvido && blingIds.length === 0) {
        resultados.push({ pedido_id: pedidoId, bling_pedido_id: null, resultado: "sem_etiqueta", codigo: null, detalhe: "remessa sem bling_pedido_id" });
      }
    }

    const resumo = {
      ok: true,
      candidatos: pedidoIds.length,
      ja_resolvidos: jaResolvidos.size,
      processados: pendentes.length,
      registrados: resultados.filter((r) => r.resultado === "registrado").length,
      sem_etiqueta: resultados.filter((r) => r.resultado === "sem_etiqueta").length,
      sem_codigo: resultados.filter((r) => r.resultado === "sem_codigo").length,
      erros: resultados.filter((r) => r.resultado === "erro").length,
      resultados,
    };
    console.log("[bling-rastreio-sync] resumo:", JSON.stringify({ ...resumo, resultados: undefined }));
    return new Response(JSON.stringify(resumo), { status: 200, headers: jsonHeaders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[bling-rastreio-sync] FAIL:", msg);
    return new Response(JSON.stringify({ erro: msg }), { status: 500, headers: jsonHeaders });
  }
});
