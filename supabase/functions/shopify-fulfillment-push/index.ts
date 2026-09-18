// Edge Function: shopify-fulfillment-push
// Frente `frente-descida-b2c-split-sp` — a SUBIDA do rastreio: cria o fulfillment
// no Shopify (com o codigo dos Correios) quando o pedido B2C e despachado.
//
// Substitui a perna "Rastreio" da integracao nativa Bling<->Shopify, que sera
// desligada. O Shopify nao acompanha Correios sozinho: quem sabe o rastreio e o
// SNCF (`pedido_rastreamento`), e e dele que o cliente self-service e notificado.
//
// Ligacao pedido interno -> pedido Shopify:
//   pedido_rastreamento.pedido_id -> nfs_emitidas.pedido_venda_id
//   -> nfs_emitidas.numero_pedido_loja (= `numeroLoja` que a descida gravou no Bling,
//      isto e, o id de 13 digitos do pedido no Shopify)
//   -> shopify_pedidos.shopify_id (confirma que o numero e mesmo um pedido da loja)
//
// Idempotencia SEM DDL (esta frente nao cria tabela): a autoridade e a propria API
// do Shopify — se o pedido ja tem fulfillment com esse rastreio, pula em silencio.
// `shopify_fulfillments` (espelho do webhook) e usado so como pre-filtro barato.
//
// Auth: `x-cron-secret` contra `get_vault_secret('SYNC_CRON_SECRET')`, ou usuario
//       autenticado para disparo manual.
//
// FORA DE ESCOPO (v2): mudanca de fase (in_transit/delivered) via fulfillment
// events. O desenho fica aberto — funcao separada, disparada por evento de
// rastreio, chamando `fulfillmentEventCreate`. Nada disso e feito aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeShopifyAdmin, gidPedido } from "../_shared/shopify/admin-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const LOTE_PADRAO = 25;
const ESPERA_ENTRE_CHAMADAS_MS = 250; // folga contra o custo por ponto da Admin API
const TRANSPORTADORA_PADRAO = "Correios";
const URL_RASTREIO_PADRAO = "https://rastreamento.correios.com.br/app/index.php?objeto={codigo}";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any -- cliente supabase-js sem tipos gerados nas edges
type Supa = any;

type Candidato = {
  pedido_id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  codigo_rastreio: string;
  servico: string | null;
};

type Detalhe = {
  pedido_id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  codigo_rastreio: string;
  resultado: "criado" | "ja_existia" | "sem_fulfillment_order" | "erro" | "dry";
  fulfillment_id?: string | null;
  erro?: string | null;
};

const QUERY_PEDIDO = `
query pedidoFulfillment($id: ID!) {
  order(id: $id) {
    id
    name
    displayFulfillmentStatus
    fulfillments(first: 25) {
      id
      status
      trackingInfo { number company url }
    }
    fulfillmentOrders(first: 25) {
      edges {
        node {
          id
          status
          requestStatus
        }
      }
    }
  }
}`;

// A mutation de fulfillment mudou de nome entre versoes da Admin API
// (`fulfillmentCreateV2` -> `fulfillmentCreate`). Em vez de chutar qual existe na
// versao configurada, tentamos a V2 e caimos na nova quando o schema recusa o
// campo. O input e o mesmo — so o nome do tipo muda.
const MUT_V2 = `
mutation criarFulfillment($fulfillment: FulfillmentV2Input!) {
  fulfillmentCreateV2(fulfillment: $fulfillment) {
    fulfillment { id status trackingInfo { number company url } }
    userErrors { field message }
  }
}`;

const MUT_NOVA = `
mutation criarFulfillment($fulfillment: FulfillmentInput!) {
  fulfillmentCreate(fulfillment: $fulfillment) {
    fulfillment { id status trackingInfo { number company url } }
    userErrors { field message }
  }
}`;

/** Normaliza codigo de rastreio para comparacao (Correios: AA123456789BR). */
const normalizarRastreio = (v: unknown): string =>
  String(v ?? "").toUpperCase().replace(/\s+/g, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  const supabase: Supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ── Auth: cron (x-cron-secret) ou usuario autenticado ─────────────────────
  const cronSecret = req.headers.get("x-cron-secret");
  let autorizado = false;
  if (cronSecret) {
    const { data: esperado } = await supabase.rpc("get_vault_secret", {
      p_name: "SYNC_CRON_SECRET",
    });
    if (esperado && cronSecret === String(esperado)) autorizado = true;
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
  if (!autorizado) return json({ sucesso: false, erro: "Não autorizado" }, 401);

  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "1";
  const loteParam = parseInt(url.searchParams.get("lote") ?? "", 10);
  const lote = Number.isFinite(loteParam) && loteParam > 0 ? Math.min(loteParam, 100) : LOTE_PADRAO;

  const resultado = {
    candidatos: 0,
    criados: 0,
    ja_existiam: 0,
    erros: 0,
    dry,
    detalhes: [] as Detalhe[],
  };

  try {
    // ── 1. Pedidos da loja que ainda nao estao fulfillados ──────────────────
    // Pre-filtro barato pelo espelho. O espelho pode atrasar (webhook), por isso a
    // decisao final e sempre da API do Shopify, mais abaixo.
    const { data: pedidosLoja, error: ePed } = await supabase
      .from("shopify_pedidos")
      .select("shopify_id, order_name, fulfillment_status, cancelled_at")
      .is("cancelled_at", null)
      .or("fulfillment_status.is.null,fulfillment_status.neq.fulfilled")
      .order("created_at_shopify", { ascending: false })
      // 200 e teto de seguranca do tamanho da URL do PostgREST: estes ids viram um
      // `.in()` logo abaixo. Com ~5 pedidos/dia no B2C, 200 em aberto e folga larga.
      .limit(200);
    if (ePed) throw new Error(`ler shopify_pedidos: ${ePed.message}`);

    const abertos = new Map<string, string | null>();
    for (const p of pedidosLoja ?? []) abertos.set(String(p.shopify_id), p.order_name ?? null);
    if (abertos.size === 0) return json({ sucesso: true, ...resultado });

    // ── 2. NFs que carregam o numero do pedido da loja ──────────────────────
    // `numero_pedido_loja` e o `numeroLoja` que a descida gravou no Bling e que o
    // sync de NF trouxe de volta — a unica ponte entre pedido interno e Shopify.
    const { data: nfs, error: eNf } = await supabase
      .from("nfs_emitidas")
      .select("pedido_venda_id, numero_pedido_loja")
      .not("pedido_venda_id", "is", null)
      .in("numero_pedido_loja", [...abertos.keys()]);
    if (eNf) throw new Error(`ler nfs_emitidas: ${eNf.message}`);

    const pedidoParaShopify = new Map<string, string>();
    for (const nf of nfs ?? []) {
      const interno = String(nf.pedido_venda_id);
      const loja = String(nf.numero_pedido_loja ?? "").trim();
      if (loja && abertos.has(loja) && !pedidoParaShopify.has(interno)) {
        pedidoParaShopify.set(interno, loja);
      }
    }
    if (pedidoParaShopify.size === 0) return json({ sucesso: true, ...resultado });

    // ── 3. Rastreio registrado no SNCF ──────────────────────────────────────
    const { data: rastreios, error: eRas } = await supabase
      .from("pedido_rastreamento")
      .select("pedido_id, codigo_rastreio, servico, atualizado_em")
      .in("pedido_id", [...pedidoParaShopify.keys()])
      .not("codigo_rastreio", "is", null)
      .order("atualizado_em", { ascending: false });
    if (eRas) throw new Error(`ler pedido_rastreamento: ${eRas.message}`);

    const candidatos: Candidato[] = [];
    const vistos = new Set<string>();
    for (const r of rastreios ?? []) {
      const interno = String(r.pedido_id);
      if (vistos.has(interno)) continue;
      const codigo = normalizarRastreio(r.codigo_rastreio);
      if (!codigo) continue;
      const shopifyId = pedidoParaShopify.get(interno)!;
      vistos.add(interno);
      candidatos.push({
        pedido_id: interno,
        shopify_pedido_id: shopifyId,
        order_name: abertos.get(shopifyId) ?? null,
        codigo_rastreio: codigo,
        servico: r.servico ?? null,
      });
      if (candidatos.length >= lote) break;
    }

    resultado.candidatos = candidatos.length;
    if (candidatos.length === 0) return json({ sucesso: true, ...resultado });

    // ── 4. Pre-filtro pelo espelho de fulfillments (evita chamada a toa) ─────
    const { data: fulfEspelho } = await supabase
      .from("shopify_fulfillments")
      .select("order_id, tracking_number, status")
      .in("order_id", candidatos.map((c) => c.shopify_pedido_id));
    const jaNoEspelho = new Set(
      (fulfEspelho ?? [])
        .filter((f: { status?: string | null }) => String(f.status ?? "").toLowerCase() !== "cancelled")
        .map(
          (f: { order_id?: string | null; tracking_number?: string | null }) =>
            `${String(f.order_id ?? "")}|${normalizarRastreio(f.tracking_number)}`,
        ),
    );

    // ── 5. Configuracao de rotulo/URL (DIMENSAO-VIA-TABELA, com queda honesta) ─
    const { data: cfgShopify } = await supabase
      .from("integracoes_config")
      .select("config")
      .eq("sistema", "shopify")
      .maybeSingle();
    const cfg = (cfgShopify?.config ?? {}) as Record<string, unknown>;
    const transportadora = String(cfg.b2c_fulfillment_transportadora ?? "").trim() ||
      TRANSPORTADORA_PADRAO;
    // Template de URL configuravel: quando o portal self-service do SNCF virar a
    // pagina oficial de rastreio, basta trocar a chave — sem mexer nesta edge.
    const templateUrl = String(cfg.b2c_rastreio_url_template ?? "").trim() || URL_RASTREIO_PADRAO;

    const shopify = await makeShopifyAdmin(supabase);
    // Descoberta do nome da mutation: feita uma vez por execucao, na primeira criacao.
    let mutation: string | null = null;

    for (const c of candidatos) {
      const detalhe = (r: Detalhe) => {
        resultado.detalhes.push(r);
      };

      try {
        if (jaNoEspelho.has(`${c.shopify_pedido_id}|${c.codigo_rastreio}`)) {
          resultado.ja_existiam++;
          detalhe({ ...c, resultado: "ja_existia" });
          continue;
        }

        await dormir(ESPERA_ENTRE_CHAMADAS_MS);
        const r = await shopify.gql<{
          order: {
            id: string;
            name: string | null;
            displayFulfillmentStatus: string | null;
            fulfillments: { id: string; status: string; trackingInfo: { number: string | null }[] }[];
            fulfillmentOrders: { edges: { node: { id: string; status: string } }[] };
          } | null;
        }>(QUERY_PEDIDO, { id: gidPedido(c.shopify_pedido_id) });

        if (r.status !== 200 || r.errors) {
          throw new Error(
            `GraphQL HTTP ${r.status}: ${JSON.stringify(r.errors ?? r.body).slice(0, 400)}`,
          );
        }
        const order = r.data?.order ?? null;
        if (!order) {
          throw new Error(`Pedido ${c.shopify_pedido_id} não encontrado na Admin API.`);
        }

        // IDEMPOTENCIA (autoridade): fulfillment vivo com este rastreio -> pula.
        const jaTem = (order.fulfillments ?? []).some(
          (f) =>
            String(f.status ?? "").toUpperCase() !== "CANCELLED" &&
            (f.trackingInfo ?? []).some((t) => normalizarRastreio(t?.number) === c.codigo_rastreio),
        );
        if (jaTem) {
          resultado.ja_existiam++;
          detalhe({ ...c, resultado: "ja_existia" });
          continue;
        }

        // So fulfillment order aberta aceita fulfillment. Sem nenhuma, o pedido ja
        // foi despachado por outro caminho (ou foi cancelado): nao e erro, e fato.
        const fos = (order.fulfillmentOrders?.edges ?? [])
          .map((e) => e.node)
          .filter((n) => ["OPEN", "IN_PROGRESS", "SCHEDULED"].includes(String(n.status ?? "").toUpperCase()));
        if (fos.length === 0) {
          detalhe({ ...c, resultado: "sem_fulfillment_order" });
          continue;
        }

        const input = {
          // Sem `fulfillmentOrderLineItems`: fulfillment TOTAL (todo o restante da
          // fulfillment order). Fulfillment parcial e caso que o B2C nao tem hoje;
          // inventar a quebra por linha seria dado fabricado.
          lineItemsByFulfillmentOrder: fos.map((fo) => ({ fulfillmentOrderId: fo.id })),
          trackingInfo: {
            number: c.codigo_rastreio,
            company: transportadora,
            url: templateUrl.replace("{codigo}", encodeURIComponent(c.codigo_rastreio)),
          },
          // O cliente e self-service: o e-mail do Shopify com o rastreio e a
          // notificacao que a nativa fazia e que precisa continuar existindo.
          notifyCustomer: true,
        };

        if (dry) {
          console.log("[fulfillment-push][dry] criaria fulfillment (NENHUMA mutation enviada)", {
            ...c,
            fulfillment_orders: fos.map((f) => f.id),
            input,
          });
          detalhe({ ...c, resultado: "dry", fulfillment_id: null });
          continue;
        }

        // Envia; na primeira vez descobre qual nome de mutation a versao aceita.
        const enviar = async (mut: string) => await shopify.gql(mut, { fulfillment: input });
        let resp = await enviar(mutation ?? MUT_V2);
        const schemaRecusou = (resp.errors ?? []).some((e: { message?: string }) =>
          /fulfillmentCreateV2|FulfillmentV2Input|doesn't exist|Field '.*' doesn't exist/i.test(
            String(e?.message ?? ""),
          ),
        );
        if (!mutation && schemaRecusou) {
          console.log("[fulfillment-push] schema recusou fulfillmentCreateV2 — usando fulfillmentCreate");
          mutation = MUT_NOVA;
          resp = await enviar(MUT_NOVA);
        }

        if (resp.status !== 200 || resp.errors) {
          throw new Error(
            `mutation falhou (HTTP ${resp.status}): ${JSON.stringify(resp.errors ?? resp.body).slice(0, 400)}`,
          );
        }

        // deno-lint-ignore no-explicit-any -- corpo da mutation varia com o nome usado
        const payload: any = resp.data as any;
        const bloco = payload?.fulfillmentCreateV2 ?? payload?.fulfillmentCreate ?? null;
        const userErrors = bloco?.userErrors ?? [];
        if (userErrors.length > 0) {
          throw new Error(
            `userErrors: ${
              userErrors
                .map(
                  (u: { field?: string[]; message?: string }) =>
                    `${(u.field ?? []).join(".")}: ${u.message}`,
                )
                .join(" | ")
            }`,
          );
        }
        const criado = bloco?.fulfillment ?? null;
        if (!criado?.id) {
          // 200 sem fulfillment e sucesso falso.
          throw new Error(`Shopify respondeu sem fulfillment: ${JSON.stringify(resp.body).slice(0, 400)}`);
        }

        // Fixa o nome que funcionou para os proximos itens do lote.
        if (!mutation) mutation = payload?.fulfillmentCreate ? MUT_NOVA : MUT_V2;

        console.log("[fulfillment-push] fulfillment criado", {
          pedido_id: c.pedido_id,
          shopify_pedido_id: c.shopify_pedido_id,
          order_name: c.order_name ?? order.name,
          codigo_rastreio: c.codigo_rastreio,
          fulfillment_id: criado.id,
        });
        resultado.criados++;
        detalhe({ ...c, resultado: "criado", fulfillment_id: criado.id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // FAIL-LOUD: sem tabela de fila propria nesta frente, o erro grita no log e
        // volta no corpo da resposta (que o cron registra). Nunca fire-and-forget.
        console.error("[fulfillment-push] falha", {
          pedido_id: c.pedido_id,
          shopify_pedido_id: c.shopify_pedido_id,
          codigo_rastreio: c.codigo_rastreio,
          erro: msg,
        });
        resultado.erros++;
        resultado.detalhes.push({ ...c, resultado: "erro", erro: msg });
      }
    }

    // Erro em qualquer item mantem o 200 do lote (os outros foram processados), mas
    // o corpo carrega a contagem — e o cron registra corpo, nao so status.
    return json({ sucesso: resultado.erros === 0, duracao_ms: Date.now() - t0, ...resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[fulfillment-push] erro fatal", { erro: msg });
    return json({ sucesso: false, erro: msg, ...resultado }, 500);
  }
});
