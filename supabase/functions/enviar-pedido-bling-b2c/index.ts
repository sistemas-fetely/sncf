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
import {
  BLING_BASE,
  ensureFreshToken,
  makeBlingClient,
  refreshAccessToken,
} from "../_shared/bling/bling-client.ts";
import { makeShopifyAdmin, gidPedido } from "../_shared/shopify/admin-client.ts";
import {
  chaveSku,
  escolherCandidatoApi,
} from "../_shared/bling/card-canonico.ts";
import { resolverProdutoBling } from "../_shared/bling/resolver-produto.ts";


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
  /** NULO quando a linha nasceu no SNCF (Venda Direta) — ver `pedido_id`. */
  shopify_pedido_id: string | null;
  /** Pedido interno SNCF (Venda Direta). Preenchido quando `shopify_pedido_id` e nulo. */
  pedido_id: string | null;
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
  shopify_pedido_id: string | null;
  order_name: string | null;
  resultado: "enviado" | "erro" | "dry";
  bling_pedido_id?: number | null;
  bling_pedido_numero?: string | null;
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

/** Normaliza telefone BR para o formato que o Bling aceita: "(15) 99789-6084".
 *  O Bling RECUSA E.164 com "+" (pedido Shopify 6726112280635). Validacao
 *  SEMANTICA (pedido #1384, 6751151358011: "+15089880936", numero dos EUA,
 *  virava "(15) 08988-0936", passava so por tamanho e o Bling recusava com
 *  VALIDATION_ERROR): "+" sem "+55" = estrangeiro -> null; tira DDI 55 (12/13
 *  digitos); DDD com digitos 1-9; celular (11) com 3o digito 9; fixo (10) com
 *  3o digito 2-5. Devolve null quando invalido: o campo e omitido. */
const telefoneBR = (v: unknown): string | null => {
  const bruto = String(v ?? "").trim();
  if (bruto.startsWith("+") && !bruto.startsWith("+55")) return null;
  let d = bruto.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (!/^[1-9][1-9]$/.test(d.slice(0, 2))) return null;
  if (d.length === 11) {
    if (d[2] !== "9") return null;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (!/[2-5]/.test(d[2])) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
};

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
  const bruto = limparTexto(address1);
  if (!bruto) return { logradouro: "", numero: "S/N" };
  const m = bruto.match(/^(.*?)[,\s]+(\d+[A-Za-z]?)$/);
  // Apos o split, sobras de virgula/espaco no fim do logradouro saem
  // ("Avenida Brigadeiro Salema," -> "Avenida Brigadeiro Salema").
  const logradouro = (m ? m[1] : bruto).replace(/[,\s]+$/, "").trim();
  return { logradouro, numero: m ? m[2].trim() : "S/N" };
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
        "id, shopify_pedido_id, pedido_id, order_name, tentativas, loja_bling_id_resolvida, centro_id_resolvido, regra_id",
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
    // Cliente Shopify so quando ha item de origem Shopify no lote: linha de Venda
    // Direta (origem SNCF) nao toca Shopify em nada.
    const shopify = itensFila.some((i) => i.shopify_pedido_id)
      ? await makeShopifyAdmin(supabase)
      : null;

    // PUT /contatos/{id} — o cliente compartilhado so tem get/post. Usado apenas
    // para atualizar o endereco do contato pre-existente; falha nao bloqueia.
    const putBling = async (endpoint: string, body: unknown): Promise<void> => {
      const doFetch = (tk: string) =>
        fetch(`${BLING_BASE}${endpoint}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${tk}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
      let res = await doFetch(bling.currentToken());
      if (res.status === 401) {
        const novoToken = await refreshAccessToken(supabase, { ...cfg, access_token: bling.currentToken() });
        res = await doFetch(novoToken);
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Bling PUT ${endpoint} ${res.status}: ${txt.slice(0, 300)}`);
      }
    };

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

        // ══ RAMO ORIGEM SNCF (Venda Direta) ═════════════════════════════════
        // Linha sem `shopify_pedido_id` e com `pedido_id`: o pedido nasceu no SNCF
        // (VD-xxxx). Troca SÓ a fonte dos dados — pedidos/pedido_itens/parceiros —
        // e NUNCA lê shopify_pedidos/shopify_itens nem a API do Shopify.
        if (!item.shopify_pedido_id) {
          const pedidoIdVd = item.pedido_id;
          if (!pedidoIdVd) {
            await falhar("Linha da fila sem `shopify_pedido_id` e sem `pedido_id` — origem desconhecida; nada enviado ao Bling.");
            continue;
          }

          /** Evento no pedido SNCF. Falha ao gravar o evento nao some: vai pro log e pro detalhe. */
          const registrarEvento = async (tipo: string, descricao: string, metadata: Record<string, unknown>) => {
            if (dry) return null;
            const { error: eEv } = await supabase.from("pedido_eventos").insert({
              pedido_id: pedidoIdVd,
              tipo_evento: tipo,
              descricao,
              metadata: { fila_id: item.id, ...metadata },
              automatico: true,
            });
            if (eEv) {
              console.error("[b2c-descida][vd] falha ao gravar pedido_eventos", {
                fila_id: item.id,
                pedido_id: pedidoIdVd,
                erro: eEv.message,
              });
              return `falha ao gravar pedido_eventos: ${eEv.message}`;
            }
            return null;
          };
          const falharVd = async (msg: string, bruto?: unknown) => {
            await falhar(msg, bruto);
            const eEv = await registrarEvento("erro_automacao", `Falha ao criar no Bling: ${msg}`.slice(0, 2000), {});
            if (eEv) {
              const d = resultado.detalhes[resultado.detalhes.length - 1];
              if (d) d.erro = `${d.erro ?? ""} · ${eEv}`;
            }
          };

          // Pedido
          const { data: ped, error: ePedVd } = await supabase
            .from("pedidos")
            .select(
              "id, id_externo, valor_bruto, valor_frete, valor_liquido, frete_tipo, endereco_entrega, observacao_pedido, parceiro_id, origem",
            )
            .eq("id", pedidoIdVd)
            .maybeSingle();
          if (ePedVd) {
            await falharVd(`ler pedidos: ${ePedVd.message}`);
            continue;
          }
          if (!ped) {
            await falhar(`Pedido SNCF ${pedidoIdVd} não encontrado em \`pedidos\` — nada enviado ao Bling.`);
            continue;
          }
          if (ped.origem !== "venda_direta") {
            await falharVd(
              `Pedido ${ped.id_externo} tem origem "${ped.origem ?? "(nula)"}" — a descida B2C sem Shopify só aceita origem 'venda_direta'. Nada enviado ao Bling.`,
            );
            continue;
          }
          const idExterno = String(ped.id_externo ?? "").trim();
          if (!idExterno) {
            await falharVd("Pedido sem `id_externo` — sem ele o `numeroLoja` não casa a NF de volta. Nada enviado ao Bling.");
            continue;
          }

          // Itens
          const { data: itensVdRaw, error: eItVd } = await supabase
            .from("pedido_itens")
            .select("sku, descricao, quantidade, valor_unitario")
            .eq("pedido_id", pedidoIdVd);
          if (eItVd) {
            await falharVd(`ler pedido_itens: ${eItVd.message}`);
            continue;
          }
          const itensVd: ItemPedido[] = ((itensVdRaw ?? []) as Record<string, unknown>[])
            .map((it) => ({
              sku: it.sku ? String(it.sku).trim() : "",
              nome: String(it.descricao ?? "").trim(),
              qtd: Number(it.quantidade ?? 0),
              unitario: Number(it.valor_unitario ?? 0),
            }))
            .filter((it) => it.qtd > 0);
          if (itensVd.length === 0) {
            await falharVd(`Pedido ${idExterno} sem itens em \`pedido_itens\` — nada a enviar.`);
            continue;
          }
          const semSkuVd = itensVd.filter((it) => !it.sku);
          if (semSkuVd.length > 0) {
            await falharVd(
              `${semSkuVd.length} item(ns) sem SKU no pedido ${idExterno}: ` +
                semSkuVd.map((it) => it.nome || "(sem nome)").join(" | "),
            );
            continue;
          }

          // Cliente (CPF e nome vêm do cadastro SNCF)
          const { data: cli, error: eCli } = await supabase
            .from("parceiros_comerciais")
            .select("razao_social, cpf, telefone, email, cep, logradouro, numero, endereco_complemento, bairro, cidade, uf")
            .eq("id", ped.parceiro_id)
            .maybeSingle();
          if (eCli) {
            await falharVd(`ler parceiros_comerciais: ${eCli.message}`);
            continue;
          }
          if (!cli) {
            await falharVd(`Cliente ${ped.parceiro_id} do pedido ${idExterno} não encontrado em \`parceiros_comerciais\`.`);
            continue;
          }
          const documentoVd = soDigitos(cli.cpf);
          if (documentoVd.length !== 11 && documentoVd.length !== 14) {
            await falharVd(
              `Cliente do pedido ${idExterno} sem CPF válido no cadastro — pedido NÃO criado no Bling (sem documento não há NF).`,
            );
            continue;
          }
          const nomeVd = limparTexto(cli.razao_social);
          if (!nomeVd) {
            await falharVd(`Cliente do pedido ${idExterno} sem nome no cadastro — contato no Bling ficaria sem nome.`);
            continue;
          }
          const emailVd = String(cli.email ?? "").trim();
          const telefoneBrutoVd = cli.telefone;
          const telefoneVd = telefoneBR(telefoneBrutoVd);

          // Endereço: entrega → `pedidos.endereco_entrega`; retirada → cadastro do cliente.
          const endPed = (ped.endereco_entrega ?? {}) as Record<string, unknown>;
          // Modal VD: retirada | sedex | pac | frete_fetely (legado `entrega` = PAC).
          const modalVd = String(endPed.modal ?? "");
          const retirada = modalVd === "retirada";
          const freteFetely = modalVd === "frete_fetely";
          const servicoVd = modalVd === "sedex" ? servicoSedex : servicoPac;
          const endVd = retirada
            ? {
              logradouro: limparTexto(cli.logradouro),
              numero: limparTexto(cli.numero),
              complemento: limparTexto(cli.endereco_complemento),
              bairro: limparTexto(cli.bairro),
              cep: soDigitos(cli.cep),
              municipio: limparTexto(cli.cidade),
              uf: String(cli.uf ?? "").trim().slice(0, 2).toUpperCase(),
            }
            : {
              logradouro: limparTexto(endPed.logradouro),
              numero: limparTexto(endPed.numero),
              complemento: limparTexto(endPed.complemento),
              bairro: limparTexto(endPed.bairro),
              cep: soDigitos(endPed.cep),
              municipio: limparTexto(endPed.cidade),
              uf: String(endPed.uf ?? "").trim().slice(0, 2).toUpperCase(),
            };
          if (!retirada && (!endVd.cep || !endVd.logradouro || !endVd.municipio || !endVd.uf)) {
            await falharVd(
              `Pedido ${idExterno} (entrega) com endereço incompleto em \`endereco_entrega\` (CEP, logradouro, cidade e UF são obrigatórios).`,
            );
            continue;
          }
          if (!retirada && !freteFetely && !["sedex", "pac", "entrega"].includes(modalVd)) {
            await falharVd(`Pedido ${idExterno} com modal de entrega desconhecido ("${modalVd || "(vazio)"}") — nada enviado.`);
            continue;
          }
          if (modalVd === "sedex" && !servicoSedex) {
            await falharVd("config do serviço SEDEX ausente (integracoes_config.b2c_servico_sedex) — pedido NÃO enviado.");
            continue;
          }
          if (!retirada && !freteFetely && transporteCfgFaltando.length > 0) {
            await falharVd(
              `Config de transporte B2C ausente em integracoes_config (${transporteCfgFaltando.join(", ")}) — pedido NÃO enviado sem transporte.`,
            );
            continue;
          }

          // Modal do frete — DIMENSAO-VIA-TABELA (`frete_tipos.mod_frete_nf`).
          // Retirada: padrão "sem frete" já existente na dimensão = FOB_CLIENTE
          // (por conta do destinatário), sem transportadora.
          const codigoFrete = retirada ? "FOB_CLIENTE" : String(ped.frete_tipo ?? "");
          let fretePorContaVd: number | null = null;
          if (codigoFrete) {
            const { data: fd, error: eFd } = await supabase
              .from("frete_tipos")
              .select("mod_frete_nf")
              .eq("codigo", codigoFrete)
              .maybeSingle();
            if (eFd) {
              await falharVd(`ler frete_tipos: ${eFd.message}`);
              continue;
            }
            if (fd?.mod_frete_nf != null) fretePorContaVd = Number(fd.mod_frete_nf);
          }
          if (freteFetely) {
            // Frete Fetely: transporte próprio por conta do remetente. Sem código na
            // dimensão frete_tipos para isso → 3 (NF-e: próprio por conta do remetente).
            const { data: fp, error: eFp } = await supabase
              .from("frete_tipos")
              .select("mod_frete_nf")
              .eq("mod_frete_nf", 3)
              .limit(1)
              .maybeSingle();
            if (eFp) {
              await falharVd(`ler frete_tipos: ${eFp.message}`);
              continue;
            }
            fretePorContaVd = fp?.mod_frete_nf != null ? Number(fp.mod_frete_nf) : 3;
          }
          if (fretePorContaVd == null) {
            if (retirada) {
              await falharVd("frete_tipos sem `mod_frete_nf` para FOB_CLIENTE — modal da retirada indefinido; nada enviado.");
              continue;
            }
            // Entrega sem frete_tipo mapeado: cai no CIF da dimensão (mesma queda do ramo Shopify) e LOGA.
            fretePorContaVd = fretePorConta;
            console.warn("[b2c-descida][vd] frete_tipo sem mod_frete_nf — usando CIF da dimensão", {
              pedido_id: pedidoIdVd,
              frete_tipo: ped.frete_tipo ?? null,
            });
          }

          // Produtos — MESMA resolução do ramo Shopify (fn_bling_resolver_produto → API).
          const skusVd: string[] = [...new Set(itensVd.map((it) => it.sku))];
          const mapaVd: Record<string, number> = {};
          const fonteVd: Record<string, string> = {};
          const bloqueiosVd: string[] = [];
          const motivoVd: Record<string, string> = {};
          for (const sku of skusVd) {
            const rr = await resolverProdutoBling(supabase, sku);
            const idRpc = Number(rr.bling_id);
            if (rr.ok && Number.isFinite(idRpc) && idRpc > 0) {
              mapaVd[sku] = idRpc;
              fonteVd[sku] = rr.como ?? "rpc";
              continue;
            }
            if (rr.card_inativo) {
              bloqueiosVd.push(`${sku}${rr.sku ? ` (SKU ${rr.sku})` : ""}: ${rr.motivo ?? "card INATIVO no Bling"}`);
              continue;
            }
            motivoVd[sku] = rr.motivo ?? "codigo nao resolve para produto do Bling";
          }
          if (bloqueiosVd.length > 0) {
            await falharVd(
              `${bloqueiosVd.length} item(ns) apontam para card INATIVO no Bling — ` +
                `o Bling recusaria o pedido. Reative o card ou corrija o codigo na origem: ` +
                bloqueiosVd.join(" | ") + ". Nada foi criado no Bling.",
            );
            continue;
          }
          const nomesCatVd: Record<string, string> = {};
          const faltamVd = skusVd.filter((sku) => !mapaVd[sku]);
          if (faltamVd.length > 0) {
            const { data: catRows } = await supabase
              .from("sncf_produtos")
              .select("sku, nome_comercial")
              .in("sku", faltamVd);
            for (const c of catRows ?? []) {
              if (c?.nome_comercial) nomesCatVd[chaveSku(c.sku)] = String(c.nome_comercial);
            }
          }
          const novosCacheVd: { sku: string; bling_produto_id: number; nome: string }[] = [];
          for (const sku of skusVd) {
            if (mapaVd[sku]) continue;
            await dormir(ESPERA_ENTRE_CHAMADAS_MS);
            try {
              const resp = await bling.get(`/produtos?codigo=${encodeURIComponent(sku)}&limite=100`);
              const escolha = escolherCandidatoApi(resp?.data ?? [], sku, nomesCatVd[chaveSku(sku)] ?? null);
              if (escolha) {
                if (escolha.total > 1) {
                  console.warn("[b2c-descida][vd] card duplicado no Bling", {
                    sku,
                    candidatos: escolha.total,
                    escolhido: escolha.id,
                    motivo: escolha.motivo,
                    origem: "api",
                  });
                }
                mapaVd[sku] = escolha.id;
                fonteVd[sku] = "api";
                novosCacheVd.push({
                  sku,
                  bling_produto_id: escolha.id,
                  nome: itensVd.find((it) => it.sku === sku)?.nome ?? sku,
                });
              }
            } catch (_) {
              // Falha de consulta nao resolve o SKU: o guardrail abaixo decide.
            }
          }
          if (novosCacheVd.length > 0 && !dry) {
            await supabase
              .from("bling_produtos_cache")
              .upsert(novosCacheVd, { onConflict: "sku" })
              .then(
                () => {},
                () => {},
              );
          }
          const naoResVd = skusVd.filter((sku) => !mapaVd[sku]);
          if (naoResVd.length > 0) {
            await falharVd(
              `${naoResVd.length} SKU(s) sem produto no Bling — cadastre ou corrija o codigo antes de reenviar: ` +
                naoResVd.map((s) => `${s}${motivoVd[s] ? ` — ${motivoVd[s]}` : ""}`).join(" | ") +
                ". Nada foi criado no Bling.",
            );
            continue;
          }

          // Contato — MESMA lógica: GET por documento, POST tipo F/J, PUT do endereço se existir.
          await dormir(ESPERA_ENTRE_CHAMADAS_MS);
          let contatoVd: number | null = null;
          try {
            const busca = await bling.get(`/contatos?numeroDocumento=${encodeURIComponent(documentoVd)}&limite=10`);
            const achado = (busca?.data ?? []).find(
              (c: { id?: number; numeroDocumento?: string }) => soDigitos(c?.numeroDocumento) === documentoVd,
            );
            if (achado?.id) contatoVd = Number(achado.id);
          } catch (e) {
            await falharVd(`Falha ao consultar contato no Bling: ${(e as Error).message}`);
            continue;
          }
          const preexistenteVd = contatoVd;
          const enderecoGeralVd = {
            endereco: endVd.logradouro,
            numero: endVd.numero,
            complemento: endVd.complemento,
            bairro: endVd.bairro || "Não informado",
            cep: endVd.cep,
            municipio: endVd.municipio,
            uf: endVd.uf,
          };
          const contatoNovoVd = {
            nome: nomeVd,
            tipo: documentoVd.length === 14 ? "J" : "F",
            numeroDocumento: documentoVd,
            indicadorIE: 9,
            situacao: "A",
            ...(emailVd ? { email: emailVd } : {}),
            ...(telefoneVd ? { celular: telefoneVd, telefone: telefoneVd } : {}),
            endereco: { geral: enderecoGeralVd },
          };
          let avisoTelVd: string | null = null;
          if (!contatoVd && telefoneBrutoVd && !telefoneVd) {
            avisoTelVd = `aviso: telefone inválido para o Bling ("${String(telefoneBrutoVd)}") — contato criado sem telefone`;
            console.warn("[b2c-descida][vd]", avisoTelVd, { pedido_id: pedidoIdVd, fila_id: item.id });
          }
          if (!contatoVd) {
            if (dry) {
              console.log("[b2c-descida][vd][dry] contato inexistente, seria criado", {
                pedido_id: pedidoIdVd,
                contato: contatoNovoVd,
              });
            } else {
              await dormir(ESPERA_ENTRE_CHAMADAS_MS);
              try {
                const criado = await bling.post("/contatos", contatoNovoVd);
                contatoVd = Number(criado?.data?.id ?? criado?.id ?? 0) || null;
              } catch (e) {
                await falharVd(`Falha ao criar contato no Bling: ${(e as Error).message}`);
                continue;
              }
              if (!contatoVd) {
                await falharVd("Bling aceitou o POST /contatos mas não devolveu id — contato não confirmado.");
                continue;
              }
            }
          }
          let avisoEnderecoVd: string | null = null;
          if (preexistenteVd && !dry) {
            // O nome da NF é o do dono do CPF no SNCF: contato achado pelo documento
            // com outro nome é corrigido no mesmo PUT; se não corrigir, não desce.
            const normalizarNome = (s: unknown) =>
              String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
            let nomeAntigoVd: string | null = null;
            let nomeDivergeVd = false;
            try {
              await dormir(ESPERA_ENTRE_CHAMADAS_MS);
              const atual = await bling.get(`/contatos/${preexistenteVd}`);
              const contatoAtual = ((atual?.data ?? atual ?? {}) as Record<string, unknown>);
              const enderecoAtual = (contatoAtual.endereco ?? {}) as Record<string, unknown>;
              nomeAntigoVd = String(contatoAtual.nome ?? "");
              nomeDivergeVd = normalizarNome(nomeAntigoVd) !== normalizarNome(nomeVd);
              await putBling(`/contatos/${preexistenteVd}`, {
                ...contatoAtual,
                ...(nomeDivergeVd ? { nome: nomeVd } : {}),
                endereco: { ...enderecoAtual, geral: enderecoGeralVd },
              });
            } catch (e) {
              if (nomeDivergeVd) {
                await falharVd(
                  `Contato do Bling com o CPF ${documentoVd} está com outro nome ('${nomeAntigoVd}') e não foi possível corrigir: ${(e as Error).message}. Corrija o nome no Bling e reenvie.`,
                );
                continue;
              }
              avisoEnderecoVd =
                `aviso: falha ao atualizar endereço do contato ${preexistenteVd}: ${(e as Error).message}`;
              console.warn("[b2c-descida][vd]", avisoEnderecoVd, { pedido_id: pedidoIdVd });
              await supabase
                .from("bling_pedido_fila_b2c")
                .update({ ultimo_erro: avisoEnderecoVd.slice(0, 2000) })
                .eq("id", item.id);
            }
            if (nomeDivergeVd) {
              const docMascarado = documentoVd.length === 11
                ? `***.${documentoVd.slice(3, 6)}.${documentoVd.slice(6, 9)}-**`
                : `${documentoVd.slice(0, 2)}.***.***/${documentoVd.slice(8, 12)}-**`;
              await registrarEvento(
                "alterado",
                `Contato do Bling corrigido: '${nomeAntigoVd}' → '${nomeVd}' (CPF ${docMascarado})`,
                { bling_contato_id: preexistenteVd, nome_antigo: nomeAntigoVd, nome_novo: nomeVd },
              );
            }
          }

          // Valores: itens a preço de varejo; desconto do pedido à parte; frete = frete COBRADO.
          const totalProdutosVd = arred2(itensVd.reduce((s, it) => s + it.unitario * it.qtd, 0));
          const freteVd = arred2(Math.max(0, Number(ped.valor_frete ?? 0)));
          const descontoVd = arred2(Math.max(0, Number((ped.endereco_entrega as any)?.desconto?.valor ?? 0)));
          const totalVd = arred2(totalProdutosVd - descontoVd + freteVd);
          const liquidoVd = arred2(Number(ped.valor_liquido ?? 0));
          if (Math.abs(totalVd - liquidoVd) > 0.01) {
            await falharVd(
              `Total do pedido ${idExterno} não fecha: itens R$ ${totalProdutosVd} − desconto R$ ${descontoVd} + frete R$ ${freteVd} = R$ ${totalVd}, ` +
                `mas valor_liquido = R$ ${liquidoVd}. Nada enviado ao Bling.`,
            );
            continue;
          }
          const blingItensVd = itensVd.map((it) => ({
            codigo: it.sku,
            descricao: it.nome || it.sku,
            produto: { id: mapaVd[it.sku] },
            unidade: "UN",
            quantidade: it.qtd,
            valor: parseFloat(it.unitario.toFixed(4)),
          }));
          const hojeVd = new Date().toISOString().slice(0, 10);
          const obsVd = [
            `Venda direta SNCF ${idExterno}`,
            limparTexto(ped.observacao_pedido),
            avisoTelVd ? `Telefone original do cliente (inválido p/ Bling): ${String(telefoneBrutoVd)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");

          const payloadVd: Record<string, unknown> = {
            // CHAVE DE CONTINUIDADE: a NF volta com numeroPedidoLoja = id_externo (VD-xxxx).
            numeroLoja: idExterno,
            data: hojeVd,
            dataSaida: hojeVd,
            loja: { id: lojaId },
            contato: contatoVd ? { id: contatoVd } : null,
            itens: blingItensVd,
            // Já pago pelo portão — mesma premissa do ramo Shopify.
            parcelas: [],
            totalProdutos: totalProdutosVd,
            total: totalVd,
            ...(descontoVd > 0 ? { desconto: { valor: descontoVd, unidade: "REAL" } } : {}),
            transporte: retirada
              ? { fretePorConta: fretePorContaVd }
              : freteFetely
              ? {
                fretePorConta: fretePorContaVd,
                ...(freteVd > 0 ? { frete: freteVd } : {}),
                etiqueta: {
                  nome: nomeVd,
                  endereco: endVd.logradouro,
                  numero: endVd.numero,
                  complemento: endVd.complemento,
                  bairro: endVd.bairro || "Não informado",
                  cep: endVd.cep,
                  municipio: endVd.municipio,
                  uf: endVd.uf,
                  nomePais: "",
                },
              }
              : {
                fretePorConta: fretePorContaVd,
                ...(freteVd > 0 ? { frete: freteVd } : {}),
                contato: { id: transportadoraContatoId },
                volumes: [{ servico: servicoVd }],
                etiqueta: {
                  nome: nomeVd,
                  endereco: endVd.logradouro,
                  numero: endVd.numero,
                  complemento: endVd.complemento,
                  bairro: endVd.bairro || "Não informado",
                  cep: endVd.cep,
                  municipio: endVd.municipio,
                  uf: endVd.uf,
                  nomePais: "",
                },
              },
            // Só no pedido do Bling: `observacoes` vira "Informações complementares" da NF.
            observacoesInternas: obsVd,
          };

          if (dry) {
            console.log("[b2c-descida][vd][dry] payload montado (NENHUM POST feito)", {
              fila_id: item.id,
              pedido_id: pedidoIdVd,
              payload: payloadVd,
            });
            resultado.detalhes.push({
              fila_id: item.id,
              shopify_pedido_id: null,
              order_name: idExterno,
              resultado: "dry",
              payload: payloadVd,
            });
            continue;
          }

          await dormir(ESPERA_ENTRE_CHAMADAS_MS);
          let blingIdVd: number | null = null;
          let blingNumeroVd: string | null = null;
          try {
            const resp = await bling.post("/pedidos/vendas", payloadVd);
            blingIdVd = Number(resp?.data?.id ?? resp?.id ?? 0) || null;
            if (!blingIdVd) {
              await falharVd("Bling respondeu sem id de pedido — envio não confirmado.", resp);
              continue;
            }
            // Número curto: mesma busca silenciosa do ramo Shopify (pedido já existe; não reprocessar).
            try {
              await dormir(ESPERA_ENTRE_CHAMADAS_MS);
              const det = await bling.get(`/pedidos/vendas/${blingIdVd}`);
              const n = (det?.data ?? det ?? {})?.numero;
              if (n != null && String(n).trim() !== "") blingNumeroVd = String(n).trim();
              else console.error("[b2c-descida][vd] pedido criado mas Bling não devolveu `numero`", { fila_id: item.id, bling_pedido_id: blingIdVd });
              const totalBling = Number((det?.data ?? det ?? {})?.total);
              if (Number.isFinite(totalBling) && Math.abs(arred2(totalBling) - liquidoVd) > 0.01) {
                await falharVd(
                  `Pedido ${idExterno} criado no Bling (id ${blingIdVd}) com total R$ ${arred2(totalBling)}, ` +
                    `mas valor_liquido = R$ ${liquidoVd}. Corrija no Bling antes de faturar.`,
                  det,
                );
                continue;
              }
            } catch (eN) {
              console.error("[b2c-descida][vd] falha ao buscar número curto — descida segue", {
                fila_id: item.id,
                bling_pedido_id: blingIdVd,
                erro: (eN as Error).message ?? String(eN),
              });
            }
          } catch (e) {
            await falharVd(`POST /pedidos/vendas: ${(e as Error).message}`);
            continue;
          }

          console.log("[b2c-descida][vd] envio OK", {
            fila_id: item.id,
            pedido_id: pedidoIdVd,
            id_externo: idExterno,
            loja_bling_id: lojaId,
            centro_id: item.centro_id_resolvido,
            contato_id: contatoVd,
            bling_pedido_id: blingIdVd,
            bling_pedido_numero: blingNumeroVd,
            total: totalVd,
            retirada,
            resolucao_produto: fonteVd,
            duracao_ms: Date.now() - t0,
          });

          const { error: eOkVd } = await supabase
            .from("bling_pedido_fila_b2c")
            .update({
              status: "enviado",
              bling_pedido_id: blingIdVd,
              bling_pedido_numero: blingNumeroVd,
              processado_em: new Date().toISOString(),
              ultimo_erro: ([avisoEnderecoVd, avisoTelVd].filter(Boolean).join(" · ") || null),
            })
            .eq("id", item.id);
          const errosPos: string[] = [];
          if (eOkVd) {
            console.error("[b2c-descida][vd] pedido criado no Bling mas fila não atualizou", {
              fila_id: item.id,
              bling_pedido_id: blingIdVd,
              erro: eOkVd.message,
            });
            errosPos.push(`fila não atualizou: ${eOkVd.message}`);
          }
          const eEvOk = await registrarEvento(
            "outro",
            `Pedido criado no Bling (loja Site SP) nº ${blingNumeroVd ?? blingIdVd}`,
            { bling_pedido_id: String(blingIdVd), bling_pedido_numero: blingNumeroVd, loja_bling_id: lojaId },
          );
          if (eEvOk) errosPos.push(eEvOk);

          resultado.enviados++;
          resultado.detalhes.push({
            fila_id: item.id,
            shopify_pedido_id: null,
            order_name: idExterno,
            resultado: "enviado",
            bling_pedido_id: blingIdVd,
            bling_pedido_numero: blingNumeroVd,
            ...(errosPos.length > 0 ? { erro: errosPos.join(" · ") } : {}),
          });
          continue;
        }
        // ══ fim ramo origem SNCF ════════════════════════════════════════════

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
        const r = await shopify!.gql<PedidoShopifyApi>(QUERY_PEDIDO, {
          id: gidPedido(item.shopify_pedido_id!),
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
          limparTexto(
            order.shippingAddress?.name ??
              [order.shippingAddress?.firstName, order.shippingAddress?.lastName]
                .filter(Boolean)
                .join(" ") ??
              "",
          ) ||
          limparTexto(order.customer?.displayName) ||
          limparTexto(
            [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" "),
          );
        if (!nomeCliente) {
          await falhar("Pedido sem nome de cliente (shippingAddress/customer vazios) — contato no Bling ficaria sem nome.");
          continue;
        }
        const emailCliente = (order.email ?? order.customer?.email ?? "").trim();
        const telefoneBruto = order.shippingAddress?.phone ?? order.phone ?? order.customer?.phone;
        const telefoneCliente = telefoneBR(telefoneBruto);

        // 4. Produtos por codigo — UMA FUNCAO SO (22/09/2026, pedido #1336), igual ao B2B:
        //    `fn_bling_resolver_produto(codigo)` → cod_cadastro → SKU → espelho, e NUNCA
        //    devolve card inativo. O Shopify manda o cod_cadastro no lugar do SKU em
        //    parte dos casos; resolver pela string caia no card duplicado INATIVO e o
        //    Bling recusava com "Produto nao encontrado, id invalido".
        //    API do Bling fica como ULTIMO recurso. NUNCA cria produto no Bling.
        //    VEM ANTES DO CONTATO de proposito: codigo nao resolvido aborta o item sem ter
        //    criado NADA no Bling — contato orfao de pedido que nunca desceu e lixo.
        const skus: string[] = [...new Set(itens.map((it) => it.sku))];

        const mapaProduto: Record<string, number> = {};
        const fonteResolucao: Record<string, string> = {};
        const bloqueiosCadastro: string[] = [];
        const motivoSemCard: Record<string, string> = {};

        for (const sku of skus) {
          const r = await resolverProdutoBling(supabase, sku);
          const idRpc = Number(r.bling_id);
          if (r.ok && Number.isFinite(idRpc) && idRpc > 0) {
            mapaProduto[sku] = idRpc;
            fonteResolucao[sku] = r.como ?? "rpc";
            continue;
          }
          if (r.card_inativo) {
            bloqueiosCadastro.push(
              `${sku}${r.sku ? ` (SKU ${r.sku})` : ""}: ${r.motivo ?? "card INATIVO no Bling"}`,
            );
            continue;
          }
          motivoSemCard[sku] = r.motivo ?? "codigo nao resolve para produto do Bling";
        }

        // Card inativo e problema de CADASTRO, nao de rede: tentar de novo nao resolve.
        if (bloqueiosCadastro.length > 0) {
          await falhar(
            `${bloqueiosCadastro.length} item(ns) apontam para card INATIVO no Bling — ` +
              `o Bling recusaria o pedido. Reative o card ou corrija o codigo na origem: ` +
              bloqueiosCadastro.join(" | ") + ". Nada foi criado no Bling.",
          );
          continue;
        }


        // Nome do catalogo: desempate do ULTIMO RECURSO (mesma regra da RPC).
        const nomesCatalogo: Record<string, string> = {};
        const faltamApi = skus.filter((sku) => !mapaProduto[sku]);
        if (faltamApi.length > 0) {
          const { data: catRows } = await supabase
            .from("sncf_produtos")
            .select("sku, nome_comercial")
            .in("sku", faltamApi);
          for (const r of catRows ?? []) {
            if (r?.nome_comercial) nomesCatalogo[chaveSku(r.sku)] = String(r.nome_comercial);
          }
        }

        const novosCache: { sku: string; bling_produto_id: number; nome: string }[] = [];
        for (const sku of skus) {
          if (mapaProduto[sku]) continue;
          await dormir(ESPERA_ENTRE_CHAMADAS_MS);
          try {
            const resp = await bling.get(`/produtos?codigo=${encodeURIComponent(sku)}&limite=100`);
            const escolha = escolherCandidatoApi(
              resp?.data ?? [],
              sku,
              nomesCatalogo[chaveSku(sku)] ?? null,
            );
            if (escolha) {
              if (escolha.total > 1) {
                // Card duplicado no Bling: registra a decisao, nunca decide em silencio.
                console.warn("[b2c-descida] card duplicado no Bling", {
                  sku,
                  candidatos: escolha.total,
                  escolhido: escolha.id,
                  motivo: escolha.motivo,
                  origem: "api",
                });
              }
              mapaProduto[sku] = escolha.id;
              fonteResolucao[sku] = "api";
              novosCache.push({
                sku,
                bling_produto_id: escolha.id,
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
            `${naoResolvidos.length} SKU(s) sem produto no Bling — cadastre ou corrija o ` +
              `codigo antes de reenviar: ` +
              naoResolvidos
                .map((s) => `${s}${motivoSemCard[s] ? ` — ${motivoSemCard[s]}` : ""}`)
                .join(" | ") +
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
        // Contato JA EXISTENTE no Bling: o id e reutilizado, mas o cadastro pode
        // estar com endereco velho/sujo — e a NF puxa endereco do cadastro.
        const contatoPreexistente = contatoId;

        const { logradouro, numero } = separarNumero(limparTexto(ender?.address1));
        const address2Limpo = limparTexto(ender?.address2);
        // O checkout BR entrega address2 como "complemento, bairro" (medido no
        // pedido Shopify 6723510665275). Divide na PRIMEIRA virgula; sem virgula,
        // tudo vira complemento e o bairro fica ausente (cai no fallback abaixo).
        const idxVirgula = address2Limpo.indexOf(",");
        const complementoEndereco = idxVirgula >= 0 ? address2Limpo.slice(0, idxVirgula).trim() : address2Limpo;
        const bairroEndereco = idxVirgula >= 0 ? address2Limpo.slice(idxVirgula + 1).trim() : "";
        const municipioEndereco = limparTexto(ender?.city) || limparTexto(pedido.shipping_city);
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
              complemento: complementoEndereco,
              // BAIRRO: o Shopify nao tem campo proprio e `company` chega sempre
              // null; o checkout BR o entrega em address2 apos a virgula. Sem
              // bairro, "Não informado" e o padrao da propria nativa.
              bairro: bairroEndereco || "Não informado",
              cep: soDigitos(ender?.zip ?? pedido.shipping_zip),
              municipio: municipioEndereco,
              uf: (ender?.provinceCode ?? pedido.shipping_province ?? "").toString().slice(0, 2),
            },
          },
        };

        let avisoTel: string | null = null;
        if (!contatoId && telefoneBruto && !telefoneCliente) {
          avisoTel = `aviso: telefone inválido para o Bling ("${String(telefoneBruto)}") — contato criado sem telefone`;
          console.warn("[b2c-descida]", avisoTel, { fila_id: item.id, order_name: pedido.order_name ?? item.order_name });
        }
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

        // Contato PRE-EXISTENTE: atualiza APENAS o endereco geral com o endereco
        // de entrega do pedido atual (ja parseado e limpo). Nome, documento, tipo,
        // indicadorIE, situacao, email e telefone seguem intactos — o payload e
        // lido do Bling e reenviado como veio, com so o endereco.geral trocado.
        // Falha NAO bloqueia o envio: o pedido leva a etiqueta correta de qualquer
        // forma; o aviso fica registrado no `ultimo_erro` da fila (sem mudar status).
        let avisoEndereco: string | null = null;
        if (contatoPreexistente) {
          if (dry) {
            // Dry-run NAO faz PUT — zero efeito, como o padrao do dry.
            console.log("[b2c-descida][dry] contato existente, endereco geral seria atualizado", {
              shopify_pedido_id: item.shopify_pedido_id,
              contato_id: contatoPreexistente,
            });
          } else {
            try {
              await dormir(ESPERA_ENTRE_CHAMADAS_MS);
              const atual = await bling.get(`/contatos/${contatoPreexistente}`);
              const contatoAtual = ((atual?.data ?? atual ?? {}) as Record<string, unknown>);
              const enderecoAtual = (contatoAtual.endereco ?? {}) as Record<string, unknown>;
              await putBling(`/contatos/${contatoPreexistente}`, {
                ...contatoAtual,
                endereco: {
                  ...enderecoAtual,
                  geral: {
                    endereco: logradouro,
                    numero,
                    complemento: complementoEndereco,
                    bairro: bairroEndereco || "Não informado",
                    cep: soDigitos(ender?.zip ?? pedido.shipping_zip),
                    municipio: municipioEndereco,
                    uf: (ender?.provinceCode ?? pedido.shipping_province ?? "").toString().slice(0, 2),
                  },
                },
              });
              console.log("[b2c-descida] endereco geral do contato atualizado", {
                contato_id: contatoPreexistente,
                shopify_pedido_id: item.shopify_pedido_id,
              });
            } catch (e) {
              avisoEndereco =
                `aviso: falha ao atualizar endereço do contato ${contatoPreexistente}: ${(e as Error).message}`;
              console.warn("[b2c-descida]", avisoEndereco, { shopify_pedido_id: item.shopify_pedido_id });
              await supabase
                .from("bling_pedido_fila_b2c")
                .update({ ultimo_erro: avisoEndereco.slice(0, 2000) })
                .eq("id", item.id);
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
              complemento: complementoEndereco,
              // Bairro parseado do address2 (checkout BR); sem bairro, "Não
              // informado" e o padrao da propria nativa.
              bairro: bairroEndereco || "Não informado",
              cep: soDigitos(ender?.zip ?? pedido.shipping_zip),
              municipio: municipioEndereco,
              uf: (ender?.provinceCode ?? pedido.shipping_province ?? "").toString().slice(0, 2),
              nomePais: "",
            },
          },
          observacoes: `Pedido ${pedido.order_name ?? item.order_name ?? ""} (Shopify ${item.shopify_pedido_id}) via SNCF`.trim(),
          ...(avisoTel ? { observacoesInternas: `Telefone original do cliente (inválido p/ Bling): ${String(telefoneBruto)}` } : {}),
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
        // Número CURTO do pedido no Bling (ex.: 596) — é o que a Eva e a tela do
        // Bling usam; o POST devolve só o id interno (ex.: 26914201352).
        let blingPedidoNumero: string | null = null;
        try {
          const resp = await bling.post("/pedidos/vendas", payload);
          blingPedidoId = Number(resp?.data?.id ?? resp?.id ?? 0) || null;
          if (!blingPedidoId) {
            // 200 sem id e sucesso falso: tratamos como falha.
            await falhar("Bling respondeu sem id de pedido — envio não confirmado.", resp);
            continue;
          }

          // Número curto: GET /pedidos/vendas/{id} para ler `numero`. O pedido JÁ
          // EXISTE no Bling — esta busca NÃO PODE derrubar a descida. Qualquer
          // falha (HTTP, parse, `numero` ausente) é silenciosa: loga e segue com
          // só o `bling_pedido_id`. Nada de marcar erro na fila nem reprocessar —
          // repetir o POST criaria duplicata.
          try {
            await dormir(ESPERA_ENTRE_CHAMADAS_MS);
            const detalheResp = await bling.get(`/pedidos/vendas/${blingPedidoId}`);
            const numeroCurto = (detalheResp?.data ?? detalheResp ?? {})?.numero;
            if (numeroCurto != null && String(numeroCurto).trim() !== "") {
              blingPedidoNumero = String(numeroCurto).trim();
            } else {
              console.error("[b2c-descida] pedido criado mas Bling não devolveu `numero`", {
                fila_id: item.id,
                shopify_pedido_id: item.shopify_pedido_id,
                bling_pedido_id: blingPedidoId,
                resposta: detalheResp,
              });
            }
          } catch (eNumero) {
            console.error("[b2c-descida] falha ao buscar número curto do pedido — descida segue", {
              fila_id: item.id,
              shopify_pedido_id: item.shopify_pedido_id,
              bling_pedido_id: blingPedidoId,
              erro: (eNumero as Error).message ?? String(eNumero),
            });
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
            bling_pedido_numero: blingPedidoNumero,
            total: totalPedido,
            itens: blingItens.length,
            duracao_ms: Date.now() - t0,
            // CARD-CANÔNICO: por qual degrau cada SKU resolveu (canonico | cache | api).
            resolucao_produto: fonteResolucao,

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
            // Número curto do Bling (pode vir null se a busca silenciosa falhou —
            // a descida não depende dele).
            bling_pedido_numero: blingPedidoNumero,
            processado_em: new Date().toISOString(),
            // aviso de endereco (se houve) sobrevive ao sucesso — nao some no null.
            ultimo_erro: ([avisoEndereco, avisoTel].filter(Boolean).join(" · ") || null),
          })
          .eq("id", item.id);
        if (eOk) {
          // O pedido JA existe no Bling. Nao ha o que desfazer: grita alto com o id
          // para conserto manual — a UNIQUE de `shopify_pedido_id` impede duplicar.
          console.error("[b2c-descida] pedido criado no Bling mas fila não atualizou", {
            fila_id: item.id,
            bling_pedido_id: blingPedidoId,
            bling_pedido_numero: blingPedidoNumero,
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
          bling_pedido_numero: blingPedidoNumero,
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
