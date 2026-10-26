// Edge Function: shopify-fulfillment-push
// Frente `frente-descida-b2c-split-sp` — a SUBIDA do rastreio: cria o fulfillment
// no Shopify (com o codigo dos Correios) quando o pedido B2C e despachado.
//
// Substitui a perna "Rastreio" da integracao nativa Bling<->Shopify, que sera
// desligada. O Shopify nao acompanha Correios sozinho: quem sabe o rastreio e o
// SNCF (`pedido_rastreamento`), e e dele que o cliente self-service e notificado.
//
// TRES FONTES (F3, multimodal):
//   1. Correios — `pedido_rastreamento.codigo_rastreio` (a original, intocada).
//   2. Mesa SP  — evento `mesa_despachado` com `metadata->>'modal'` em
//      (LALAMOVE, MOTOBOY). Esses pedidos NUNCA terao SRO, entao sem esta
//      segunda perna o Shopify nunca saberia que sairam e o cliente nunca
//      receberia o e-mail de envio.
//   3. Entrega SNCF — pedido B2C entregue sem despacho rastreavel: entrega
//      declarada a mao (`entregue_metodo='manual'`, modal MANUAL) ou ultimo
//      `mesa_despachado` com modal RETIRADA/TRANSPORTADORA. Precedencia:
//      correios > mesa_sp > entrega_sncf. Dedup por PEDIDO. MANUAL/RETIRADA nao
//      notificam o cliente (ja esta com o produto). So gera mutation real com
//      `integracoes_config.config.b2c_fulfillment_entrega_sncf_ativo = 'true'`;
//      sem a chave, sai como `dry`. So pedidos criados nos ultimos
//      `JANELA_ADMIN_API_DIAS` dias — a Admin API sem `read_all_orders` nao devolve
//      os mais velhos, entao eles nao viram erro eterno.
// A ponte para o Shopify e a mesma nas tres; o que muda e o `trackingInfo`.
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

// ── Fulfillment multimodal (F3) ────────────────────────────────────────────
// A Mesa de Expedicao SP despacha por modal que os Correios nao cobrem. Esses
// pedidos nunca vao aparecer em `pedido_rastreamento` (nao tem SRO), entao o
// Shopify jamais saberia que sairam. Segunda fonte, mesma edge, mesmo dedup.
//
// A dimensao `b2c_modal_entrega` e a autoridade sobre quais modais existem; aqui
// listamos apenas os que esta edge sabe traduzir para `trackingInfo`. Modal novo
// na dimensao NAO passa a ser empurrado sozinho — e decisao de codigo, nao de
// cadastro, porque cada um precisa de um rotulo de transportadora proprio.
const MODAIS_MULTIMODAIS = ["LALAMOVE", "MOTOBOY"] as const;
type ModalMultimodal = (typeof MODAIS_MULTIMODAIS)[number];

// Rotulos que o cliente le no e-mail do Shopify. Nao saem de
// `b2c_modal_entrega.nome` de proposito: "Motoboy proprio" e nome interno de
// operacao; para quem comprou, quem entrega e a Fetely.
const TRANSPORTADORA_POR_MODAL: Record<ModalMultimodal, string> = {
  LALAMOVE: "Lalamove",
  MOTOBOY: "Entrega Fetély",
};

/** Modais da Mesa SP tratados pela fonte entrega_sncf (3c). */
const MODAIS_ENTREGA_SNCF = ["RETIRADA", "TRANSPORTADORA"] as const;
// A Admin API sem o escopo `read_all_orders` nao devolve pedidos com mais de 60
// dias. Sem o corte, pedido antigo vira erro eterno a cada ciclo.
const JANELA_ADMIN_API_DIAS = 60;
const COMPANY_FETELY = "Fetély";
const COMPANY_TRANSPORTADORA = "Transportadora";

const EVENTO_MESA_DESPACHADO = "mesa_despachado";
const ESTAGIO_EM_TRANSPORTE = "em_transporte";

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any -- cliente supabase-js sem tipos gerados nas edges
type Supa = any;

/** De onde o candidato veio — decide dedup e formato do `trackingInfo`. */
type Fonte = "correios" | "mesa_sp" | "entrega_sncf";

type Candidato = {
  pedido_id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  fonte: Fonte;
  /** CORREIOS para a fonte antiga; o modal da mesa para a nova. */
  modal: string;
  /** SRO (Correios) ou referencia da corrida (Lalamove). Vazio no Motoboy. */
  codigo_rastreio: string;
  servico: string | null;
};

type Detalhe = {
  pedido_id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  fonte: Fonte;
  modal: string;
  codigo_rastreio: string;
  resultado: "criado" | "ja_existia" | "sem_fulfillment_order" | "erro" | "dry";
  fulfillment_id?: string | null;
  erro?: string | null;
};

/** `trackingInfo` do fulfillment: campo ausente e diferente de campo vazio. */
type TrackingInfo = { company: string; number?: string; url?: string };

/** A referencia da Lalamove as vezes e o proprio link da corrida. */
const ehLink = (v: string): boolean => /^https?:\/\//i.test(v);

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
      .select("shopify_id, order_name, fulfillment_status, cancelled_at, created_at_shopify")
      .is("cancelled_at", null)
      .or("fulfillment_status.is.null,fulfillment_status.neq.fulfilled")
      .order("created_at_shopify", { ascending: false })
      // 200 e teto de seguranca do tamanho da URL do PostgREST: estes ids viram um
      // `.in()` logo abaixo. Com ~5 pedidos/dia no B2C, 200 em aberto e folga larga.
      .limit(200);
    if (ePed) throw new Error(`ler shopify_pedidos: ${ePed.message}`);

    const abertos = new Map<string, string | null>();
    // Mapa proprio da data de criacao no Shopify: so a fonte 3c le (janela da
    // Admin API). Correios e mesa_sp seguem sem olhar para ela.
    const criadoEmShopify = new Map<string, string | null>();
    for (const p of pedidosLoja ?? []) {
      const loja = String(p.shopify_id);
      abertos.set(loja, p.order_name ?? null);
      criadoEmShopify.set(loja, p.created_at_shopify ?? null);
    }
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

    // ── 3a. Rastreio Correios registrado no SNCF (fonte original) ───────────
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
        fonte: "correios",
        modal: "CORREIOS",
        codigo_rastreio: codigo,
        servico: r.servico ?? null,
      });
      if (candidatos.length >= lote) break;
    }

    // ── 3b. Despachos multimodais da Mesa SP (fonte nova) ───────────────────
    // A verdade e o evento `mesa_despachado` que a RPC `fn_mesa_sp_despachar`
    // grava: `metadata->>'modal'` diz por onde saiu e `metadata->>'referencia'`
    // e o que o cliente consegue usar (id da corrida / nome do portador).
    //
    // O corte por lote sobra do passo 3a de proposito: Correios tem precedencia
    // por ser o volume da casa. Com ~5 pedidos/dia no B2C e lote 25, as duas
    // fontes cabem juntas — o comentario existe para quando isso deixar de valer.
    const restante = lote - candidatos.length;
    if (restante > 0) {
      const idsPonte = [...pedidoParaShopify.keys()].filter((id) => !vistos.has(id));
      if (idsPonte.length > 0) {
        // So pedido B2C que ainda esta em transporte: despacho revertido ou
        // pedido ja entregue nao tem fulfillment novo a criar.
        const { data: pedidosB2c, error: ePedB2c } = await supabase
          .from("pedidos")
          .select("id")
          .in("id", idsPonte)
          .eq("canal", "B2C")
          .eq("estagio", ESTAGIO_EM_TRANSPORTE);
        if (ePedB2c) throw new Error(`ler pedidos B2C em transporte: ${ePedB2c.message}`);

        const emTransporte = (pedidosB2c ?? []).map((p: { id: string }) => String(p.id));
        if (emTransporte.length > 0) {
          const { data: despachos, error: eDesp } = await supabase
            .from("pedido_eventos")
            .select("pedido_id, metadata, criado_em")
            .eq("tipo_evento", EVENTO_MESA_DESPACHADO)
            .in("pedido_id", emTransporte)
            .order("criado_em", { ascending: false });
          if (eDesp) throw new Error(`ler despachos da Mesa SP: ${eDesp.message}`);

          // Conjunto LOCAL do "so o ultimo despacho vale": um pedido cujo ultimo
          // despacho nao e multimodal nao vira candidato aqui, mas continua livre
          // para a fonte 3c (RETIRADA/TRANSPORTADORA). Candidatos aceitos entram
          // em `vistos` normalmente.
          const ultimoDespachoVisto = new Set<string>();
          for (const d of despachos ?? []) {
            const interno = String(d.pedido_id);
            if (vistos.has(interno) || ultimoDespachoVisto.has(interno)) continue;
            // MARCA ANTES DE DECIDIR: a lista vem do mais novo para o mais
            // velho e SO O ULTIMO DESPACHO VALE. Sem esta linha aqui, um pedido
            // redespachado por Correios cairia no `mesa_despachado` anterior de
            // Lalamove e criaria fulfillment com a transportadora errada.
            ultimoDespachoVisto.add(interno);

            const meta = (d.metadata ?? {}) as Record<string, unknown>;
            const modal = String(meta.modal ?? "").trim().toUpperCase();
            const referencia = String(meta.referencia ?? "").trim();
            const shopifyId = pedidoParaShopify.get(interno)!;

            // FRETE_FETELY (modal de negocio): quem entregou vem de
            // `metadata.executor`; o rotulo ao cliente sai de `mesa_sp_executor`.
            if (modal === MODAL_FRETE_FETELY) {
              const executores = await carregarExecutores();
              const codExec = String(meta.executor ?? "").trim().toUpperCase();
              const exec = executores.get(codExec);
              if (!exec) continue; // executor ausente/desconhecido: nao inventa transportadora
              vistos.add(interno);
              candidatos.push({
                pedido_id: interno,
                shopify_pedido_id: shopifyId,
                order_name: abertos.get(shopifyId) ?? null,
                fonte: "mesa_sp",
                modal: `${MODAL_FRETE_FETELY}:${codExec}`,
                codigo_rastreio: exec.exige_referencia ? referencia : "",
                servico: null,
                company: exec.rotulo_cliente,
              });
              if (candidatos.length >= lote) break;
              continue;
            }

            if (!(MODAIS_MULTIMODAIS as readonly string[]).includes(modal)) continue;
            vistos.add(interno);

            // A RPC ja exige referencia para modal sem rastreio automatico; se
            // ela faltar aqui, o Motoboy segue (fulfillment simples de "enviado")
            // e a Lalamove tambem — sem number, mas notificando o cliente.
            candidatos.push({
              pedido_id: interno,
              shopify_pedido_id: shopifyId,
              order_name: abertos.get(shopifyId) ?? null,
              fonte: "mesa_sp",
              modal,
              codigo_rastreio: modal === "LALAMOVE" ? referencia : "",
              servico: null,
            });
            if (candidatos.length >= lote) break;
          }
        }
      }
    }

    // ── 3c. Entrega sem despacho rastreavel (fonte entrega_sncf) ────────────
    // Retirada no balcao, entrega declarada a mao (`fn_b2c_declarar_entrega`) ou
    // transportadora avulsa da Mesa SP. Sem esta perna o pedido fica
    // "Nao processado" no Shopify para sempre (#1457, #1148).
    // Precedencia: so o lote que sobrou de 3a/3b, so pedido ainda nao visto.
    const restante3c = lote - candidatos.length;
    if (restante3c > 0) {
      const idsSemVisto = [...pedidoParaShopify.keys()].filter((id) => !vistos.has(id));
      // Corte pela janela da Admin API (ver `JANELA_ADMIN_API_DIAS`): pedido mais
      // velho que a janela nao e candidato. Data ilegivel conta como fora da
      // janela — mesmo efeito de nao repetir o erro em todo ciclo.
      const corteJanela = Date.now() - JANELA_ADMIN_API_DIAS * 86_400_000;
      const idsLivres = idsSemVisto.filter((id) => {
        const criado = criadoEmShopify.get(pedidoParaShopify.get(id) ?? "");
        const t = criado ? Date.parse(String(criado)) : NaN;
        return !Number.isNaN(t) && t >= corteJanela;
      });
      if (idsLivres.length < idsSemVisto.length) {
        console.log("[fulfillment-push][entrega_sncf] ignorados pedidos fora da janela", {
          ignorados: idsSemVisto.length - idsLivres.length,
          janela_dias: JANELA_ADMIN_API_DIAS,
        });
      }
      if (idsLivres.length > 0) {
        // (b) ultimo `mesa_despachado` com modal RETIRADA/TRANSPORTADORA.
        const { data: despachos3c, error: eD3c } = await supabase
          .from("pedido_eventos")
          .select("pedido_id, metadata, criado_em")
          .eq("tipo_evento", EVENTO_MESA_DESPACHADO)
          .in("pedido_id", idsLivres)
          .order("criado_em", { ascending: false });
        if (eD3c) throw new Error(`ler despachos (entrega_sncf): ${eD3c.message}`);

        const porDespacho = new Map<string, { modal: string; referencia: string }>();
        const ultimo3c = new Set<string>();
        for (const d of despachos3c ?? []) {
          const interno = String(d.pedido_id);
          if (ultimo3c.has(interno)) continue;
          ultimo3c.add(interno); // so o ultimo despacho vale
          const meta = (d.metadata ?? {}) as Record<string, unknown>;
          const modal = String(meta.modal ?? "").trim().toUpperCase();
          if (!(MODAIS_ENTREGA_SNCF as readonly string[]).includes(modal)) continue;
          porDespacho.set(interno, { modal, referencia: String(meta.referencia ?? "").trim() });
        }

        // (a) B2C entregue manualmente, nao cancelado.
        const { data: manuais, error: eMan } = await supabase
          .from("pedidos")
          .select("id")
          .in("id", idsLivres)
          .eq("canal", "B2C")
          .eq("entregue_metodo", "manual")
          .not("entregue_em", "is", null)
          .is("cancelado_em", null);
        if (eMan) throw new Error(`ler pedidos entregues manualmente: ${eMan.message}`);
        const manualSet = new Set((manuais ?? []).map((p: { id: string }) => String(p.id)));

        for (const interno of idsLivres) {
          if (candidatos.length >= lote) break;
          if (vistos.has(interno)) continue;
          const desp = porDespacho.get(interno);
          let modal: string;
          let codigo = "";
          if (manualSet.has(interno)) {
            modal = "MANUAL";
          } else if (desp) {
            modal = desp.modal;
            if (modal === "TRANSPORTADORA") codigo = desp.referencia;
          } else continue;
          vistos.add(interno);
          const shopifyId = pedidoParaShopify.get(interno)!;
          candidatos.push({
            pedido_id: interno,
            shopify_pedido_id: shopifyId,
            order_name: abertos.get(shopifyId) ?? null,
            fonte: "entrega_sncf",
            modal,
            codigo_rastreio: codigo,
            servico: null,
          });
        }
      }
    }

    resultado.candidatos = candidatos.length;
    if (candidatos.length === 0) return json({ sucesso: true, ...resultado });

    // ── 4. Pre-filtro pelo espelho de fulfillments (evita chamada a toa) ─────
    const { data: fulfEspelho } = await supabase
      .from("shopify_fulfillments")
      .select("order_id, tracking_number, status")
      .in("order_id", candidatos.map((c) => c.shopify_pedido_id));
    const fulfVivos = (fulfEspelho ?? []).filter(
      (f: { status?: string | null }) => String(f.status ?? "").toLowerCase() !== "cancelled",
    );
    const jaNoEspelho = new Set(
      fulfVivos.map(
        (f: { order_id?: string | null; tracking_number?: string | null }) =>
          `${String(f.order_id ?? "")}|${normalizarRastreio(f.tracking_number)}`,
      ),
    );
    // Dedup da fonte multimodal: o Motoboy nao tem numero de rastreio para
    // comparar, entao a chave e o PEDIDO. Um pedido da Mesa SP sai uma vez —
    // qualquer fulfillment vivo nele ja e a prova de que a subida aconteceu.
    const pedidoJaFulfillado = new Set(
      fulfVivos.map((f: { order_id?: string | null }) => String(f.order_id ?? "")),
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
    // TRAVA DE ATIVACAO da fonte entrega_sncf: so a string 'true' libera mutation.
    const entregaSncfAtiva = String(cfg.b2c_fulfillment_entrega_sncf_ativo ?? "") === "true";

    /** `trackingInfo` de cada fonte. Correios permanece exatamente como estava. */
    const trackingDe = (c: Candidato): TrackingInfo => {
      if (c.fonte === "correios") {
        return {
          number: c.codigo_rastreio,
          company: transportadora,
          url: templateUrl.replace("{codigo}", encodeURIComponent(c.codigo_rastreio)),
        };
      }
      if (c.fonte === "entrega_sncf") {
        if (c.modal !== "TRANSPORTADORA") return { company: COMPANY_FETELY };
        if (!c.codigo_rastreio) return { company: COMPANY_TRANSPORTADORA };
        return ehLink(c.codigo_rastreio)
          ? { company: COMPANY_TRANSPORTADORA, number: c.codigo_rastreio, url: c.codigo_rastreio }
          : { company: COMPANY_TRANSPORTADORA, number: c.codigo_rastreio };
      }
      const company = TRANSPORTADORA_POR_MODAL[c.modal as ModalMultimodal];
      // Motoboy: fulfillment simples de "enviado" — sem number, sem URL.
      // Inventar um codigo so para preencher campo viraria rastreio que nao rastreia.
      if (!c.codigo_rastreio) return { company };
      // Lalamove: a referencia e o numero. Quando ela ja e um link, vai tambem
      // como URL, para o cliente clicar em vez de copiar.
      return ehLink(c.codigo_rastreio)
        ? { company, number: c.codigo_rastreio, url: c.codigo_rastreio }
        : { company, number: c.codigo_rastreio };
    };

    const shopify = await makeShopifyAdmin(supabase);
    // Descoberta do nome da mutation: feita uma vez por execucao, na primeira criacao.
    let mutation: string | null = null;

    for (const c of candidatos) {
      const detalhe = (r: Detalhe) => {
        resultado.detalhes.push(r);
      };

      try {
        const preFiltrado = c.fonte === "correios"
          ? jaNoEspelho.has(`${c.shopify_pedido_id}|${c.codigo_rastreio}`)
          : pedidoJaFulfillado.has(c.shopify_pedido_id);
        if (preFiltrado) {
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

        // IDEMPOTENCIA (autoridade): a API do Shopify decide, nao o espelho.
        // Correios compara pelo rastreio (um pedido pode ter mais de um objeto);
        // a Mesa SP compara pelo pedido, porque o Motoboy nao tem numero.
        const vivos = (order.fulfillments ?? []).filter(
          (f) => String(f.status ?? "").toUpperCase() !== "CANCELLED",
        );
        const jaTem = c.fonte === "correios"
          ? vivos.some((f) =>
            (f.trackingInfo ?? []).some((t) => normalizarRastreio(t?.number) === c.codigo_rastreio)
          )
          : vivos.length > 0;
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
          trackingInfo: trackingDe(c),
          // O cliente e self-service: o e-mail do Shopify com o rastreio e a
          // notificacao que a nativa fazia e que precisa continuar existindo.
          // entrega_sncf: MANUAL/RETIRADA nao notificam (e-mail de "enviado" apos
          // a entrega e ruido); TRANSPORTADORA notifica.
          notifyCustomer: c.fonte === "entrega_sncf" ? c.modal === "TRANSPORTADORA" : true,
        };

        if (dry || (c.fonte === "entrega_sncf" && !entregaSncfAtiva)) {
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
          fonte: c.fonte,
          modal: c.modal,
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
          fonte: c.fonte,
          modal: c.modal,
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
