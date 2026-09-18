// Edge Function: enviar-pedido-bling-b2c
// Frente `frente-descida-b2c-split-sp` — a DESCIDA do pedido B2C: consome a fila
// `bling_pedido_fila_b2c` e cria o pedido de venda no Bling, na loja que a fila
// mandou (split por CEP resolvido ANTES, no trigger — esta edge nao decide rota).
//
// Substitui a importacao de pedidos da integracao nativa Shopify<->Bling.
//
// Fluxo por item da fila:
//   1. `processando` (fecha a janela de dois workers pegarem o mesmo item)
//   2. espelho `shopify_pedidos` + `shopify_itens`
//   3. CPF via Shopify Admin GraphQL (`order.localizationExtensions`) — sem CPF, ERRO
//   4. itens por SKU em `bling_produtos_cache` -> GET /produtos?codigo= -> ERRO FAIL-LOUD
//   5. contato no Bling: GET /contatos?numeroDocumento -> POST /contatos se nao houver
//      (nesta ordem: nada e CRIADO no Bling antes de todas as validacoes passarem)
//   6. POST /pedidos/vendas
//   7. `enviado` + `bling_pedido_id`, ou tentativas+1 (volta a `pendente` ate 3, depois `erro`)
//
// Auth: `x-cron-secret` contra `get_vault_secret('SYNC_CRON_SECRET')` (padrao
//       `bling-rastreio-sync`), ou usuario autenticado para disparo manual.
// Dry-run: `?dry=1` monta e LOGA o payload sem POST e sem tocar no estado da fila
//          (nem contato novo no Bling) — serve para conferir `numeroLoja`/`loja.id`.
//
// Rate limit Bling: 3 req/s -> ~450ms entre chamadas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";
import { makeShopifyAdmin, gidPedido } from "../_shared/shopify/admin-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

const ESPERA_ENTRE_CHAMADAS_MS = 450; // Bling: 3 req/s
const LOTE_PADRAO = 10;
const MAX_TENTATIVAS = 3;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

// deno-lint-ignore no-explicit-any -- cliente supabase-js sem tipos gerados nas edges
type Supa = any;

type ItemFila = {
  id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  tentativas: number | null;
  loja_bling_id_resolvida: number | null;
  centro_id_resolvido: string | null;
  regra_id: string | null;
};

/** Item do pedido ja normalizado a partir do espelho `shopify_itens`. */
type ItemPedido = {
  sku: string;
  nome: string;
  qtd: number;
  unitario: number;
};

type Detalhe = {
  fila_id: string;
  shopify_pedido_id: string;
  order_name: string | null;
  resultado: "enviado" | "erro" | "dry";
  bling_pedido_id?: number | null;
  erro?: string | null;
  // deno-lint-ignore no-explicit-any -- payload montado para conferencia no dry-run
  payload?: any;
};

/** Mantem so digitos. CPF do checkout BR vem formatado ("123.456.789-00"). */
const soDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** Remove caracteres invisiveis/formatadores Unicode (word joiner U+2060, zero-width
 *  U+200B-200F, BOM U+FEFF, soft hyphen U+00AD, bidi U+202A-202E), colapsa espacos
 *  multiplos e trim. O checkout BR entrega address1 com U+2060 antes do numero
 *  (medido no pedido Shopify 6723510665275) e isso quebra o separador de numero.
 *  Aplicar em TODO campo de texto de endereco/nome ANTES de qualquer parse. */
const limparTexto = (v: unknown): string =>
  String(v ?? "")
    .replace(/[\u2060\u200B-\u200F\uFEFF\u00AD\u202A-\u202E]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const arred2 = (n: number) => parseFloat(n.toFixed(2));

// ── Shopify: dados que o espelho NAO tem ────────────────────────────────────
// `shopify_pedidos` guarda totais e endereco de entrega, mas nao guarda CPF,
// e-mail nem nome do cliente. Verificado em producao: `note_attributes` e
// `localization_extensions` chegam VAZIOS no webhook — o CPF do checkout BR so
// existe na Admin API, em `order.localizationExtensions` (key TAX_CREDENTIAL_BR).
// Sem CPF nao ha NF depois, entao o pedido nao desce: vira erro na fila.
const QUERY_PEDIDO = `
query pedidoB2C($id: ID!) {
  order(id: $id) {
    id
    name
    email
    phone
    shippingAddress {
      firstName lastName name company phone
      address1 address2 city province provinceCode zip countryCodeV2
    }
    shippingLine { title }
    billingAddress {
      firstName lastName name company phone
      address1 address2 city province provinceCode zip countryCodeV2
    }
    localizationExtensions(first: 10) {
      edges { node { key purpose title value countryCode } }
    }
  }
}`;

type EnderecoShopify = {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  company: string | null;
  phone: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  provinceCode: string | null;
  zip: string | null;
  countryCodeV2: string | null;
} | null;

type PedidoShopifyApi = {
  order: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    customer: {
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      email: string | null;
      phone: string | null;
    } | null;
    shippingAddress: EnderecoShopify;
    billingAddress: EnderecoShopify;
    shippingLine: { title: string | null } | null;
    localizationExtensions: {
      edges: { node: { key: string; purpose: string; title: string; value: string } }[];
    } | null;
  } | null;
};

/** CPF/CNPJ do checkout BR. `key` e enum (TAX_CREDENTIAL_BR); casamos tambem por
 *  `purpose: TAX` para nao depender do nome exato do enum entre versoes da API. */
function extrairDocumento(order: PedidoShopifyApi["order"]): string | null {
  const nodes = (order?.localizationExtensions?.edges ?? []).map((e) => e.node);
  const fiscal = nodes.find(
    (n) =>
      String(n?.key ?? "").toUpperCase().includes("TAX_CREDENTIAL") ||
      String(n?.purpose ?? "").toUpperCase() === "TAX",
  );
  const doc = soDigitos(fiscal?.value);
  // 11 = CPF, 14 = CNPJ. Qualquer outro tamanho e lixo de digitacao: nao serve pra NF.
  return doc.length === 11 || doc.length === 14 ? doc : null;
}

/** Separa numero do logradouro quando o cliente digitou "Rua X, 123". O Bling tem
 *  campo `numero` proprio; mandar tudo em `endereco` sai errado na etiqueta e na NF. */
function separarNumero(address1: string | null): { logradouro: string; numero: string } {
  const bruto = String(address1 ?? "").trim();
  if (!bruto) return { logradouro: "", numero: "S/N" };
  const m = bruto.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/);
  if (m) return { logradouro: m[1].trim(), numero: m[2].trim() };
  return { logradouro: bruto, numero: "S/N" };
}

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
  const lote = Number.isFinite(loteParam) && loteParam > 0 ? Math.min(loteParam, 50) : LOTE_PADRAO;

  const resultado = {
    processados: 0,
    enviados: 0,
    erros: 0,
    dry,
    detalhes: [] as Detalhe[],
  };

  try {
    // ── Config Bling + interruptor da descida ───────────────────────────────
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) {
      return json(
        { sucesso: false, erro: "Bling não conectado — refazer OAuth em /administrativo/bling", ...resultado },
        503,
      );
    }

    // DEFESA EM PROFUNDIDADE: o trigger de enfileiramento ja e guardado pelo mesmo
    // interruptor. Checar aqui de novo garante que uma fila com resíduo (enfileirada
    // antes do desligamento) nao desca sozinha depois que alguem desligou a chave.
    // Sai em silencio (200, zero efeito) — desligado nao e erro.
    const descidaAtiva = (cfg.config ?? {})?.b2c_descida_ativa;
    if (descidaAtiva !== true && String(descidaAtiva) !== "true") {
      console.log("[b2c-descida] interruptor OFF — nada processado", {
        b2c_descida_ativa: descidaAtiva ?? null,
      });
      return json({ sucesso: true, motivo: "b2c_descida_ativa=false", ...resultado });
    }

    // ── Fila ────────────────────────────────────────────────────────────────
    const { data: fila, error: eFila } = await supabase
      .from("bling_pedido_fila_b2c")
      .select(
        "id, shopify_pedido_id, order_name, tentativas, loja_bling_id_resolvida, centro_id_resolvido, regra_id",
      )
      .eq("status", "pendente")
      .order("criado_em", { ascending: true })
      .limit(lote);
    if (eFila) throw new Error(`ler fila: ${eFila.message}`);

    const itensFila = (fila ?? []) as ItemFila[];
    if (itensFila.length === 0) return json({ sucesso: true, ...resultado });

    // Clientes externos so depois de saber que ha trabalho (evita OAuth a toa).
    const freshToken = await ensureFreshToken(supabase, cfg);
    const bling = makeBlingClient(supabase, cfg, freshToken);
    const shopify = await makeShopifyAdmin(supabase);

    // DIMENSAO-VIA-TABELA: o modal de frete mora em `frete_tipos.mod_frete_nf`.
    // B2C da Fetely e CIF (remetente paga, frete embutido) — o codigo ativo na
    // dimensao e `CIF_ABSORVIDO`. Sem linha na dimensao, cai em 0 (CIF) e LOGA:
    // fallback honesto e ruidoso, nunca silencioso.
    const { data: freteDim } = await supabase
      .from("frete_tipos")
      .select("codigo, mod_frete_nf")
      .in("codigo", ["CIF_ABSORVIDO", "CIF"])
      .order("codigo", { ascending: true })
      .limit(1)
      .maybeSingle();
    const fretePorConta = freteDim?.mod_frete_nf ?? 0;
    if (freteDim?.mod_frete_nf == null) {
      console.warn("[b2c-descida] frete_tipos sem CIF/CIF_ABSORVIDO — fretePorConta=0 por queda", {
        encontrado: freteDim ?? null,
      });
    }

    // Logistica do pedido (espelho da integracao nativa, medida no Bling 26907106696):
    // transportadora Correios + servico PAC/SEDEX por shippingLine. Sem qualquer um
    // destes na config o item da fila FAIL-LOUD — pedido sem transporte nao desce.
    const cfgJson = (cfg.config ?? {}) as Record<string, unknown>;
    const transportadoraContatoId = Number(cfgJson.b2c_transportadora_contato_id ?? 0);
    const servicoPac = String(cfgJson.b2c_servico_pac ?? "").trim();
    const servicoSedex = String(cfgJson.b2c_servico_sedex ?? "").trim();
    const transporteCfgFaltando: string[] = [];
    if (!Number.isFinite(transportadoraContatoId) || transportadoraContatoId <= 0) {
      transporteCfgFaltando.push("b2c_transportadora_contato_id");
    }
    if (!servicoPac) transporteCfgFaltando.push("b2c_servico_pac");
    if (!servicoSedex) transporteCfgFaltando.push("b2c_servico_sedex");

    for (const item of itensFila) {
      resultado.processados++;
      const tentativasAtuais = item.tentativas ?? 0;

      /** Fecha o item em erro: tentativas+1, volta a `pendente` ate o teto, depois `erro`.
       *  Em dry-run nada e gravado — o dry nao pode consumir tentativa de ninguem. */
      const falhar = async (msg: string, bruto?: unknown) => {
        console.error("[b2c-descida] falha", {
          fila_id: item.id,
          shopify_pedido_id: item.shopify_pedido_id,
          order_name: item.order_name,
          erro: msg,
          // Resposta do Bling inteira no log: a mensagem resumida vai pra fila.
          bruto: bruto ?? null,
        });
        if (!dry) {
          const tentativas = tentativasAtuais + 1;
          await supabase
            .from("bling_pedido_fila_b2c")
            .update({
              status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente",
              tentativas,
              ultimo_erro: msg.slice(0, 2000),
            })
            .eq("id", item.id);
        }
        resultado.erros++;
        resultado.detalhes.push({
          fila_id: item.id,
          shopify_pedido_id: item.shopify_pedido_id,
          order_name: item.order_name,
          resultado: "erro",
          erro: msg,
        });
      };

      try {
        // 1. Marca `processando` — fecha a janela de dois workers pegarem o mesmo item.
        //    O `.eq('status','pendente')` e a trava: quem perder a corrida atualiza 0 linhas.
        if (!dry) {
          const { data: travado, error: eTrava } = await supabase
            .from("bling_pedido_fila_b2c")
            .update({ status: "processando" })
            .eq("id", item.id)
            .eq("status", "pendente")
            .select("id");
          if (eTrava) throw new Error(`marcar processando: ${eTrava.message}`);
          if (!travado || travado.length === 0) {
            console.log("[b2c-descida] item já tomado por outra execução", { fila_id: item.id });
            resultado.processados--;
            continue;
          }
        }

        // Guardrail de roteamento: a loja vem RESOLVIDA da fila. Sem ela nao ha
        // para onde mandar — e chutar a matriz seria inventar destino fiscal.
        const lojaId = Number(item.loja_bling_id_resolvida ?? 0);
        if (!Number.isFinite(lojaId) || lojaId <= 0) {
          await falhar(
            "Fila sem `loja_bling_id_resolvida` — roteamento não resolvido; nada enviado ao Bling.",
          );
          continue;
        }

        // Transporte e obrigatorio: pedido que descer sem logistica Correios nao
        // replica o padrao da integracao nativa e quebra a etiqueta depois.
        if (transporteCfgFaltando.length > 0) {
          await falhar(
            `Config de transporte B2C ausente em integracoes_config (${transporteCfgFaltando.join(", ")}) — pedido NÃO enviado sem transporte.`,
          );
          continue;
        }

        // 2. Espelho do pedido + itens
        const { data: pedido, error: ePed } = await supabase
          .from("shopify_pedidos")
          .select(
            "shopify_id, order_name, total, subtotal, shipping_cost, discount_amount, refunded_amount, " +
              "financial_status, cancelled_at, shipping_address, shipping_city, shipping_province, shipping_zip, tags",
          )
          .eq("shopify_id", item.shopify_pedido_id)
          .maybeSingle();
        if (ePed) throw new Error(`ler shopify_pedidos: ${ePed.message}`);
        if (!pedido) {
          await falhar(
            `Pedido ${item.shopify_pedido_id} não está no espelho \`shopify_pedidos\` — webhook não chegou ou foi perdido.`,
          );
          continue;
        }
        if (pedido.cancelled_at) {
          await falhar(`Pedido cancelado no Shopify em ${pedido.cancelled_at} — não desce ao Bling.`);
          continue;
        }

        const { data: itensRaw, error: eIt } = await supabase
          .from("shopify_itens")
          .select("sku, product_name, quantity, current_quantity, unit_price")
          .eq("pedido_id", item.shopify_pedido_id);
        if (eIt) throw new Error(`ler shopify_itens: ${eIt.message}`);

        // `current_quantity` e a verdade apos edicao na loja; linha zerada foi removida
        // do pedido e nao pode ir pra NF (fica no espelho so como historico).
        const itens: ItemPedido[] = ((itensRaw ?? []) as Record<string, unknown>[])
          .map((it) => ({
            sku: it.sku ? String(it.sku).trim() : "",
            nome: String(it.product_name ?? "").trim(),
            qtd: Number(it.current_quantity ?? it.quantity ?? 0),
            unitario: Number(it.unit_price ?? 0),
          }))
          .filter((it) => it.qtd > 0);

        if (itens.length === 0) {
          await falhar("Pedido sem itens vigentes no espelho — nada a enviar.");
          continue;
        }
        const semSku = itens.filter((it) => !it.sku);
        if (semSku.length > 0) {
          await falhar(
            `${semSku.length} item(ns) sem SKU no espelho — corrija o catálogo Shopify: ` +
              semSku.map((it) => it.nome || "(sem nome)").join(" | "),
          );
          continue;
        }

        // 3. CPF/CNPJ + dados do cliente via Admin API (nao existem no espelho)
        const r = await shopify.gql<PedidoShopifyApi>(QUERY_PEDIDO, {
          id: gidPedido(item.shopify_pedido_id),
        });
        if (r.status !== 200 || r.errors) {
          await falhar(
            `Shopify GraphQL falhou (HTTP ${r.status}) ao buscar o pedido.`,
            r.errors ?? r.body,
          );
          continue;
        }
        const order = r.data?.order ?? null;
        if (!order) {
          await falhar(`Pedido ${item.shopify_pedido_id} não encontrado na Admin API do Shopify.`);
          continue;
        }

        const documento = extrairDocumento(order);
        if (!documento) {
          // FAIL-LOUD deliberado: pedido sem documento vira NF impossivel depois.
          // Melhor a fila em `erro` (visivel) do que pedido mudo no Bling.
          await falhar(
            `Pedido ${order.name ?? item.shopify_pedido_id} sem CPF/CNPJ em ` +
              `\`localizationExtensions\` (checkout BR). Pedido NÃO criado no Bling — sem documento não há NF.`,
          );
          continue;
        }

        const ender = order.shippingAddress ?? order.billingAddress;
        const nomeCliente =
          (order.shippingAddress?.name ??
            [order.shippingAddress?.firstName, order.shippingAddress?.lastName]
              .filter(Boolean)
              .join(" ") ??
            "").trim() ||
          (order.customer?.displayName ?? "").trim() ||
          [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ").trim();
        if (!nomeCliente) {
          await falhar("Pedido sem nome de cliente (shippingAddress/customer vazios) — contato no Bling ficaria sem nome.");
          continue;
        }
        const emailCliente = (order.email ?? order.customer?.email ?? "").trim();
        const telefoneCliente = (order.shippingAddress?.phone ?? order.phone ?? order.customer?.phone ?? "")
          .toString()
          .trim();

        // 4. Produtos por SKU: cache -> GET /produtos?codigo= -> FAIL-LOUD.
        //    NUNCA cria produto no Bling (o "cria-se-nao-acha" do B2B gerava duplicata).
        //    VEM ANTES DO CONTATO de proposito: SKU nao resolvido aborta o item sem ter
        //    criado NADA no Bling — contato orfao de pedido que nunca desceu e lixo.
        const skus: string[] = [...new Set(itens.map((it) => it.sku))];
        const { data: cacheRows, error: eCache } = await supabase
          .from("bling_produtos_cache")
          .select("sku, bling_produto_id")
          .in("sku", skus);
        if (eCache) throw new Error(`ler bling_produtos_cache: ${eCache.message}`);

        const mapaProduto: Record<string, number> = {};
        for (const row of cacheRows ?? []) mapaProduto[String(row.sku).trim()] = row.bling_produto_id;

        const novosCache: { sku: string; bling_produto_id: number; nome: string }[] = [];
        for (const sku of skus) {
          if (mapaProduto[sku]) continue;
          await dormir(ESPERA_ENTRE_CHAMADAS_MS);
          try {
            const resp = await bling.get(`/produtos?codigo=${encodeURIComponent(sku)}&limite=100`);
            const achado = (resp?.data ?? []).find(
              (p: { id?: number; codigo?: string }) => String(p?.codigo ?? "").trim() === sku,
            );
            if (achado?.id) {
              mapaProduto[sku] = Number(achado.id);
              novosCache.push({
                sku,
                bling_produto_id: Number(achado.id),
                nome: itens.find((it) => it.sku === sku)?.nome ?? sku,
              });
            }
          } catch (_) {
            // Falha de consulta nao resolve o SKU: o guardrail abaixo decide.
          }
        }
        if (novosCache.length > 0 && !dry) {
          await supabase
            .from("bling_produtos_cache")
            .upsert(novosCache, { onConflict: "sku" })
            .then(
              () => {},
              () => {},
            );
        }

        const naoResolvidos = skus.filter((sku) => !mapaProduto[sku]);
        if (naoResolvidos.length > 0) {
          await falhar(
            `${naoResolvidos.length} SKU(s) sem produto no Bling — cadastre antes de reenviar: ` +
              naoResolvidos.join(", ") +
              ". Nada foi criado no Bling.",
          );
          continue;
        }

        // 5. Contato no Bling: procura por documento, cria se nao houver.
        //    So chega aqui quem ja passou por TODAS as validacoes acima.
        await dormir(ESPERA_ENTRE_CHAMADAS_MS);
        let contatoId: number | null = null;
        try {
          const busca = await bling.get(
            `/contatos?numeroDocumento=${encodeURIComponent(documento)}&limite=10`,
          );
          const achado = (busca?.data ?? []).find(
            (c: { id?: number; numeroDocumento?: string }) =>
              soDigitos(c?.numeroDocumento) === documento,
          );
          if (achado?.id) contatoId = Number(achado.id);
        } catch (e) {
          // Busca que falha nao pode virar "cria duplicado": aborta o item.
          await falhar(`Falha ao consultar contato no Bling: ${(e as Error).message}`);
          continue;
        }

        const { logradouro, numero } = separarNumero(ender?.address1 ?? null);
        const contatoNovo = {
          nome: nomeCliente,
          // CPF = pessoa Fisica; CNPJ = Juridica. O tamanho do documento decide.
          tipo: documento.length === 14 ? "J" : "F",
          numeroDocumento: documento,
          // 9 = Nao contribuinte (consumidor final) — o caso de 100% do B2C.
          indicadorIE: 9,
          situacao: "A",
          ...(emailCliente ? { email: emailCliente } : {}),
          ...(telefoneCliente ? { celular: telefoneCliente, telefone: telefoneCliente } : {}),
          endereco: {
            geral: {
              endereco: logradouro,
              numero,
              complemento: ender?.address2 ?? "",
              // BAIRRO: o Shopify nao tem campo proprio. No checkout BR desta loja ele
              // cai em `company`. Se em producao o bairro vier em `address2`, e aqui
              // que se corrige — ATE LA, bairro vazio e melhor que bairro errado na NF.
              bairro: ender?.company ?? "",
              cep: soDigitos(ender?.zip ?? pedido.shipping_zip),
              municipio: ender?.city ?? pedido.shipping_city ?? "",
              uf: (ender?.provinceCode ?? pedido.shipping_province ?? "").toString().slice(0, 2),
            },
          },
        };

        if (!contatoId) {
          if (dry) {
            // Dry-run NAO cria cadastro no Bling. O payload sai com contato nulo e
            // o detalhe registra que o contato seria criado — sem efeito colateral.
            console.log("[b2c-descida][dry] contato inexistente, seria criado", {
              shopify_pedido_id: item.shopify_pedido_id,
              contato: contatoNovo,
            });
          } else {
            await dormir(ESPERA_ENTRE_CHAMADAS_MS);
            try {
              const criado = await bling.post("/contatos", contatoNovo);
              contatoId = Number(criado?.data?.id ?? criado?.id ?? 0) || null;
            } catch (e) {
              await falhar(`Falha ao criar contato no Bling: ${(e as Error).message}`);
              continue;
            }
            if (!contatoId) {
              await falhar("Bling aceitou o POST /contatos mas não devolveu id — contato não confirmado.");
              continue;
            }
          }
        }

        // 6. Valores. `total` e `shipping_cost` sao a verdade vigente do espelho
        //    (pos-edicao). A base dos itens e `total - frete` para que
        //    totalProdutos + frete feche EXATAMENTE com o total — a mesma regra do B2B.
        const totalPedido = arred2(Number(pedido.total ?? 0));
        const valorFrete = arred2(Math.max(0, Number(pedido.shipping_cost ?? 0)));
        const baseItens = arred2(Math.max(0, totalPedido - valorFrete));
        const somaBruta = arred2(
          itens.reduce((s, it) => s + it.unitario * it.qtd, 0),
        );
        // Desconto da loja (cupom/promo) vive no total, nao na linha: o fator rateia
        // o desconto por item para que a NF saia com o preco REALMENTE pago.
        const fator = somaBruta > 0 ? baseItens / somaBruta : 1;
        if (Math.abs(arred2(Number(pedido.subtotal ?? 0)) - baseItens) > 0.05) {
          // Divergencia entre subtotal do espelho e (total - frete) costuma ser
          // reembolso parcial ou taxa. Nao bloqueia, mas nao pode virar silencio.
          console.warn("[b2c-descida] subtotal do espelho difere de (total - frete)", {
            shopify_pedido_id: item.shopify_pedido_id,
            subtotal: pedido.subtotal,
            total: totalPedido,
            frete: valorFrete,
            base_itens: baseItens,
          });
        }

        const linhas = itens.map((it) => ({
          sku: it.sku,
          nome: it.nome,
          qtd: it.qtd,
          totalLinha: arred2(it.unitario * it.qtd * fator),
        }));
        // Residuo de centavos do rateio no ULTIMO item (padrao do B2B): sem isso a
        // soma dos itens nao bate com `totalProdutos` e o Bling recusa o pedido.
        const somaLinhas = arred2(linhas.reduce((s, l) => s + l.totalLinha, 0));
        const residuo = arred2(baseItens - somaLinhas);
        if (residuo !== 0 && linhas.length > 0) {
          const ultima = linhas[linhas.length - 1];
          ultima.totalLinha = arred2(ultima.totalLinha + residuo);
        }

        const blingItens = linhas.map((l) => ({
          codigo: l.sku,
          descricao: l.nome || l.sku,
          produto: { id: mapaProduto[l.sku] },
          unidade: "UN",
          quantidade: l.qtd,
          valor: parseFloat((l.totalLinha / l.qtd).toFixed(4)),
        }));

        // `dataSaida` nunca retroativa (regra do B2B: Bling recusa/gera parcelamento errado).
        const hojeISO = new Date().toISOString().slice(0, 10);

        const payload: Record<string, unknown> = {
          // CHAVE DE CONTINUIDADE: o trigger de NF do SNCF casa o pedido interno por
          // `numeroLoja`. Errar aqui quebra o nascimento do pedido no SNCF inteiro.
          numeroLoja: String(item.shopify_pedido_id),
          data: hojeISO,
          dataSaida: hojeISO,
          // DIMENSAO-VIA-TABELA: a loja vem RESOLVIDA da fila (split por CEP feito no
          // trigger). Zero id de loja hardcoded nesta edge.
          loja: { id: lojaId },
          contato: contatoId ? { id: contatoId } : null,
          itens: blingItens,
          // Pedido JA PAGO na origem (a fila e paid-only). Duplicata no Bling que
          // ninguem vai baixar e ruido de conciliacao — o recebivel e do Shopify.
          // `parcelas: []` com total > 0 esta provado contra o Bling real no B2B.
          parcelas: [],
          totalProdutos: baseItens,
          total: totalPedido,
          transporte: {
            // CIF: remetente paga. Transportadora + servico espelham a integracao
            // nativa (medido no Bling 26907106696): o pedido ja nasce com a
            // Logistica Correios preenchida.
            fretePorConta,
            ...(valorFrete > 0 ? { frete: valorFrete } : {}),
            contato: { id: transportadoraContatoId },
            volumes: [
              {
                servico:
                  (order.shippingLine?.title ?? "").toUpperCase().includes("SEDEX")
                    ? servicoSedex
                    : servicoPac,
              },
            ],
            etiqueta: {
              nome: nomeCliente,
              endereco: logradouro,
              numero,
              complemento: ender?.address2 ?? "",
              // Shopify nao tem bairro — "Não informado" e o padrao da propria nativa.
              bairro: "Não informado",
              cep: soDigitos(ender?.zip ?? pedido.shipping_zip),
              municipio: ender?.city ?? pedido.shipping_city ?? "",
              uf: (ender?.provinceCode ?? pedido.shipping_province ?? "").toString().slice(0, 2),
              nomePais: "",
            },
          },
          observacoes: `Pedido ${pedido.order_name ?? item.order_name ?? ""} (Shopify ${item.shopify_pedido_id}) via SNCF`.trim(),
        };

        if (dry) {
          console.log("[b2c-descida][dry] payload montado (NENHUM POST feito)", {
            fila_id: item.id,
            shopify_pedido_id: item.shopify_pedido_id,
            payload,
          });
          resultado.detalhes.push({
            fila_id: item.id,
            shopify_pedido_id: item.shopify_pedido_id,
            order_name: item.order_name,
            resultado: "dry",
            payload,
          });
          continue;
        }

        // 7. POST no Bling
        await dormir(ESPERA_ENTRE_CHAMADAS_MS);
        let blingPedidoId: number | null = null;
        try {
          const resp = await bling.post("/pedidos/vendas", payload);
          blingPedidoId = Number(resp?.data?.id ?? resp?.id ?? 0) || null;
          if (!blingPedidoId) {
            // 200 sem id e sucesso falso: tratamos como falha.
            await falhar("Bling respondeu sem id de pedido — envio não confirmado.", resp);
            continue;
          }
          // LOG: `bling_envios_log.pedido_id` e NOT NULL e aponta para `pedidos.id`
          // (pedido INTERNO), que no B2C so nasce DEPOIS, pela NF. Por isso o registro
          // do envio B2C fica no console + na propria fila. Ver aviso no PR.
          console.log("[b2c-descida] envio OK", {
            fila_id: item.id,
            shopify_pedido_id: item.shopify_pedido_id,
            order_name: item.order_name,
            loja_bling_id: lojaId,
            centro_id: item.centro_id_resolvido,
            regra_id: item.regra_id,
            contato_id: contatoId,
            bling_pedido_id: blingPedidoId,
            total: totalPedido,
            itens: blingItens.length,
            duracao_ms: Date.now() - t0,
          });
        } catch (e) {
          await falhar(`POST /pedidos/vendas: ${(e as Error).message}`);
          continue;
        }

        const { error: eOk } = await supabase
          .from("bling_pedido_fila_b2c")
          .update({
            status: "enviado",
            bling_pedido_id: blingPedidoId,
            processado_em: new Date().toISOString(),
            ultimo_erro: null,
          })
          .eq("id", item.id);
        if (eOk) {
          // O pedido JA existe no Bling. Nao ha o que desfazer: grita alto com o id
          // para conserto manual — a UNIQUE de `shopify_pedido_id` impede duplicar.
          console.error("[b2c-descida] pedido criado no Bling mas fila não atualizou", {
            fila_id: item.id,
            bling_pedido_id: blingPedidoId,
            erro: eOk.message,
          });
        }

        resultado.enviados++;
        resultado.detalhes.push({
          fila_id: item.id,
          shopify_pedido_id: item.shopify_pedido_id,
          order_name: item.order_name,
          resultado: "enviado",
          bling_pedido_id: blingPedidoId,
        });
      } catch (e) {
        await falhar((e as Error).message ?? String(e));
      }
    }

    return json({ sucesso: true, duracao_ms: Date.now() - t0, ...resultado });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[b2c-descida] erro fatal", { erro: msg });
    return json({ sucesso: false, erro: msg, ...resultado }, 500);
  }
});
