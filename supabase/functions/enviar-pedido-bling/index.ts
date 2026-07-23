// Edge Function: enviar-pedido-bling
// F-3.3 — POST /pedidos/vendas no Bling a partir de pedido em pre_faturado.
// v2: suporte a remessas — lazy /01 automática + split explícito via remessa_id.
// Idempotente via pedido_remessa.bling_pedido_id. Log em bling_envios_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../_shared/bling/bling-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ok = (data: any, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
const err = (msg: string, status = 400) =>
  new Response(JSON.stringify({ sucesso: false, erro: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const t0 = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth
    const auth = req.headers.get("Authorization");
    if (!auth) return err("Não autorizado", 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return err("Não autorizado", 401);
    const userId = userData.user.id;

    // Role: super_admin, admin_rh, sops
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (roles || []).some((r: any) =>
      ["super_admin", "admin_rh", "sops"].includes(r.role)
    );
    if (!allowed) return err("Sem permissão (sops, admin_rh ou super_admin)", 403);

    // Input
    const body = await req.json().catch(() => ({}));
    const pedido_id = body?.pedido_id;
    const remessa_id_input: string | null = body?.remessa_id ?? null;
    if (!pedido_id) return err("pedido_id obrigatório");

    // ── Branch: anexos_nf ────────────────────────────────────────────────
    // Coleta PDF + XML das NFs de saída autorizadas do pedido e retorna
    // como anexos base64 para serem enviados via send-transactional-email.
    // NÃO encosta na lógica de remessa/estágio.
    if (body?.acao === "anexos_nf") {
      const { data: pedidoNf, error: pedidoNfErr } = await supabase
        .from("pedidos")
        .select("id, id_externo, nf_numero")
        .eq("id", pedido_id)
        .maybeSingle();
      if (pedidoNfErr || !pedidoNf) return err("Pedido não encontrado", 404);

      const orFilter = pedidoNf.nf_numero
        ? `pedido_venda_id.eq.${pedido_id},numero.eq.${pedidoNf.nf_numero}`
        : `pedido_venda_id.eq.${pedido_id}`;

      const { data: nfs, error: nfsErr } = await supabase
        .from("nfs_emitidas")
        .select("id, numero, bling_id, pdf_url, xml_url, tipo, situacao")
        .or(orFilter)
        .eq("tipo", "saida")
        .eq("situacao", "autorizada");
      if (nfsErr) return err(`Falha ao buscar NFs: ${nfsErr.message}`, 500);
      if (!nfs || nfs.length === 0) {
        return err("Sem NF de saída autorizada para este pedido", 422);
      }

      // Bling client lazy (apenas se precisar completar pdf/xml)
      let blingClient: any = null;
      const ensureClient = async () => {
        if (blingClient) return blingClient;
        const { data: cfg } = await supabase
          .from("integracoes_config")
          .select("*")
          .eq("sistema", "bling")
          .maybeSingle();
        if (!cfg || !cfg.access_token) {
          throw new Error("Bling não conectado");
        }
        const freshToken = await ensureFreshToken(supabase, cfg);
        blingClient = makeBlingClient(supabase, cfg, freshToken);
        return blingClient;
      };

      // base64 chunked (evita stack overflow para PDFs grandes)
      const toBase64 = (bytes: Uint8Array): string => {
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
          binary += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)) as any,
          );
        }
        return btoa(binary);
      };

      const attachments: { filename: string; content: string }[] = [];
      const nf_numeros: string[] = [];

      for (const nf of nfs) {
        let pdfUrl: string | null = nf.pdf_url ?? null;
        let xmlVal: string | null = nf.xml_url ?? null;

        if ((!pdfUrl || !xmlVal) && nf.bling_id) {
          try {
            const cli = await ensureClient();
            const resp = await cli.get(`/nfe/${nf.bling_id}`);
            const d = resp?.data ?? resp;
            pdfUrl = pdfUrl ?? d?.linkPDF ?? d?.linkDanfe ?? null;
            xmlVal = xmlVal ?? d?.xml ?? null;
            if (pdfUrl || xmlVal) {
              await supabase
                .from("nfs_emitidas")
                .update({ pdf_url: pdfUrl, xml_url: xmlVal })
                .eq("id", nf.id)
                .then(() => {})
                .catch(() => {});
            }
          } catch (e) {
            console.error(`[anexos_nf] Falha ao buscar NF ${nf.bling_id} no Bling: ${(e as Error).message}`);
          }
        }

        if (!pdfUrl) {
          return err(`NF ${nf.numero ?? nf.bling_id} sem PDF no Bling`, 422);
        }

        // PDF
        const pdfResp = await fetch(pdfUrl);
        if (!pdfResp.ok) {
          return err(`Falha ao baixar PDF da NF ${nf.numero}: HTTP ${pdfResp.status}`, 502);
        }
        const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
        attachments.push({
          filename: `NF_${nf.numero ?? nf.bling_id}.pdf`,
          content: toBase64(pdfBytes),
        });

        // XML (sempre)
        if (xmlVal) {
          let xmlText: string;
          if (xmlVal.startsWith("http")) {
            const xmlResp = await fetch(xmlVal);
            if (!xmlResp.ok) {
              return err(`Falha ao baixar XML da NF ${nf.numero}: HTTP ${xmlResp.status}`, 502);
            }
            xmlText = await xmlResp.text();
          } else {
            xmlText = xmlVal;
          }
          const xmlBytes = new TextEncoder().encode(xmlText);
          attachments.push({
            filename: `NF_${nf.numero ?? nf.bling_id}.xml`,
            content: toBase64(xmlBytes),
          });
        }

        if (nf.numero) nf_numeros.push(nf.numero);
      }

      return ok({ sucesso: true, attachments, nf_numeros });
    }
    // ── fim branch anexos_nf ─────────────────────────────────────────────



    // 1. Pedido
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pedErr || !pedido) return err("Pedido não encontrado", 404);

    // pre_separacao: envio inicial
    // em_separacao: envio de remessa adicional (/02+) em split
    const estagiosPermitidos = ["pre_separacao", "em_separacao"];
    if (!estagiosPermitidos.includes(pedido.estagio)) {
      return err(`Pedido em estágio "${pedido.estagio}" — envio não permitido neste estágio`);
    }

    // 1b. Remessa: usa a fornecida ou cria lazy /01
    let remessa: any = null;

    if (remessa_id_input) {
      // Remessa explícita (split)
      const { data: rem } = await supabase
        .from("pedido_remessa")
        .select("*")
        .eq("id", remessa_id_input)
        .eq("pedido_id", pedido_id)
        .maybeSingle();

      if (!rem) return err("Remessa não encontrada ou não pertence a este pedido", 404);
      if (rem.bling_pedido_id) return err(`Remessa já enviada ao Bling (id ${rem.bling_pedido_id})`, 409);
      if (rem.status === "cancelada") return err("Remessa cancelada — não pode ser enviada", 409);
      remessa = rem;
    } else {
      // Lazy: verifica idempotência via bling_id_destino
      if (pedido.bling_id_destino) {
        return err(`Pedido já enviado pro Bling (id ${pedido.bling_id_destino})`, 409);
      }

      // Guardrail remessas existentes — FAIL-LOUD: se já existem remessas manuais
      // não-canceladas, não cria lazy por cima. Selecione explicitamente via remessa_id.
      const { data: remessasExistentes } = await supabase
        .from("pedido_remessa")
        .select("id, sequencia, status, bling_pedido_id")
        .eq("pedido_id", pedido_id)
        .neq("status", "cancelada");

      if (remessasExistentes && remessasExistentes.length > 0) {
        const lista = remessasExistentes
          .map((r: any) => `seq ${r.sequencia} (${r.status}${r.bling_pedido_id ? ` — Bling ${r.bling_pedido_id}` : ""})`)
          .join(", ");
        return err(
          `Pedido já possui ${remessasExistentes.length} remessa(s) ativa(s): ${lista}. ` +
          `Selecione uma remessa específica para enviar ao invés de criar nova automaticamente.`,
          409,
        );
      }

      const { data: rpcResult, error: rpcErr } = await supabase.rpc("criar_remessa" as string, {
        p_pedido_id: pedido_id,
        p_status: "pronta_para_envio",
        p_observacao: "Remessa /01 criada automaticamente no envio ao Bling",
      });
      if (rpcErr || !rpcResult?.remessa_id) {
        return err(`Falha ao criar remessa /01: ${rpcErr?.message ?? "sem remessa_id"}`, 500);
      }

      const { data: rem } = await supabase
        .from("pedido_remessa")
        .select("*")
        .eq("id", rpcResult.remessa_id)
        .maybeSingle();
      if (!rem) return err("Remessa /01 criada mas não encontrada", 500);
      remessa = rem;
    }

    // Código e valor da remessa
    const remessaCodigo = `${pedido.id_externo}/${String(remessa.sequencia).padStart(2, "0")}`;
    const remessaValor = Number(remessa.valor_remessa ?? pedido.valor_liquido);

    // 2. Parceiro (cliente)
    const { data: parceiro } = await supabase
      .from("parceiros_comerciais")
      .select("id, bling_id, razao_social, cnpj")
      .eq("id", pedido.parceiro_id)
      .maybeSingle();
    if (!parceiro?.bling_id) {
      return err("Parceiro sem bling_id — sincronize o parceiro no Bling antes", 409);
    }

    // 2b. Transportadora (opcional)
    let blingTransportadoraId: number | null = null;
    let transpCnpj: string | null = null;
    let transpNome: string | null = null;
    if (pedido.transportadora_id) {
      const { data: transp } = await supabase
        .from("parceiros_comerciais")
        .select("bling_id, razao_social, cnpj")
        .eq("id", pedido.transportadora_id)
        .maybeSingle();
      if (transp?.bling_id) blingTransportadoraId = Number(transp.bling_id);
      transpCnpj = transp?.cnpj ?? null;
      transpNome = transp?.razao_social ?? null;
    }

    // 3. Forma de pagamento
    const { data: forma } = await supabase
      .from("formas_pagamento")
      .select("id, codigo, nome, bling_id_forma_pagamento")
      .eq("codigo", pedido.forma_solicitada)
      .maybeSingle();
    if (!forma) {
      return err(`Forma de pagamento "${pedido.forma_solicitada}" não encontrada em formas_pagamento`, 409);
    }

    // 4. Títulos (sempre do pedido — cobrança não fragmenta por remessa em v1)
    // 4a. Descobrir se a natureza de operação do pedido gera título a receber
    const { data: geraTituloRpc } = await supabase.rpc("fn_pedido_gera_titulo", { p_pedido_id: pedido_id });
    const geraTitulo = geraTituloRpc == null ? true : Boolean(geraTituloRpc);


    const { data: titulos } = await supabase
      .from("titulo_a_receber")
      .select("id, numero_parcela, valor_bruto, data_vencimento_original, tipo_pagamento, eh_entrada")
      .eq("pedido_id", pedido_id)
      .order("numero_parcela");
    if (geraTitulo && (!titulos || titulos.length === 0)) {
      return err("Pedido sem títulos — confirme o portão na aba Primeiro Pagamento, ou materialize a cobrança, antes de enviar ao Bling.", 409);
    }

    // 5. Itens da remessa (formato normalizado: {descricao, sku, quantidade, valor_unitario})
    const itens: any[] = Array.isArray(remessa.itens_json) ? remessa.itens_json : [];

    // 5b. Guardrail SKU — FAIL-LOUD: item sem SKU chegaria ao Bling como avulso
    // (sem produto.id e sem código), gerando aviso amarelo ⚠️. Corrija o catálogo.
    const itensSemSku = itens.filter((it: any) => !it.sku || String(it.sku).trim() === "");
    if (itensSemSku.length > 0) {
      const nomes = itensSemSku
        .map((it: any) => it.descricao ?? "(sem descrição)")
        .join(" | ");
      return err(
        `${itensSemSku.length} item(s) sem SKU — corrija o catálogo antes de enviar ao Bling: ${nomes}`,
        409,
      );
    }

    // 6. Config Bling
    const { data: cfg } = await supabase
      .from("integracoes_config")
      .select("*")
      .eq("sistema", "bling")
      .maybeSingle();
    if (!cfg || !cfg.access_token) {
      return err("Bling não conectado — fazer OAuth via /administrativo/bling", 503);
    }

    const freshToken = await ensureFreshToken(supabase, cfg);
    const client = makeBlingClient(supabase, cfg, freshToken);

    // 7. ID da forma de pagamento — lookup dinâmico no Bling (auto-corretivo)
    const FORMA_KEYWORDS: Record<string, string[]> = {
      boleto:         ["boleto"],
      pix:            ["pix"],
      transferencia:  ["transferência", "transferencia", "ted", "doc"],
      cartao_credito: ["crédito", "credito"],
      cartao_debito:  ["débito", "debito"],
      cartao:         ["crédito", "credito"],
      deposito:       ["depósito", "deposito"],
      dinheiro:       ["dinheiro"],
      cheque:         ["cheque"],
      sem_pagamento:  ["sem pagamento"],
      outro:          ["outro"],
    };

    let blingFormaId: number | null = forma.bling_id_forma_pagamento ?? null;

    try {
      const formasData = await client.get("/formas-pagamentos");
      const formasList: any[] = formasData?.data || [];
      const kws = FORMA_KEYWORDS[forma.codigo] || [forma.nome.toLowerCase()];
      const match = formasList.find((bf: any) =>
        kws.some((k) => bf.descricao?.toLowerCase().includes(k))
      );
      if (match?.id) {
        if (match.id !== forma.bling_id_forma_pagamento) {
          await supabase
            .from("formas_pagamento")
            .update({ bling_id_forma_pagamento: match.id })
            .eq("codigo", forma.codigo);
        }
        blingFormaId = match.id;
      }
    } catch (_) {
      // GET /formas-pagamentos falhou: usa o ID salvo no banco como fallback
    }

    if (!blingFormaId) {
      return err(
        `Forma "${forma.codigo}" sem ID Bling — não encontrada no banco nem via API. Configure em /parametros.`,
        409,
      );
    }

    // 7.5 Canal/Loja Fetely
    let blingLojaId: number | null = (cfg.config as any)?.loja_bling_id ?? null;
    if (!blingLojaId) {
      for (const endpoint of ["/canais-venda", "/lojas"]) {
        try {
          const resp = await client.get(endpoint);
          const lista = resp?.data ?? resp?.items ?? (Array.isArray(resp) ? resp : []);
          const found = Array.isArray(lista)
            ? lista.find((l: any) =>
                (l.descricao || l.nome || l.situacao || "").toLowerCase().includes("fetely")
              )
            : null;
          if (found?.id) {
            blingLojaId = found.id;
            const newConfig = { ...((cfg.config as any) || {}), loja_bling_id: found.id };
            await supabase.from("integracoes_config").update({ config: newConfig }).eq("id", cfg.id);
            break;
          }
        } catch (_) { /* tenta próximo endpoint */ }
      }
    }

    // 8. Parcelas — rateadas proporcional ao valor da remessa.
    // Remessa única: fator = 1 (remessaValor = soma dos títulos) → parcelas intactas (comportamento original).
    // Remessa dividida: fator < 1 → cada parcela escala na mesma proporção, mantendo datas e nº de parcelas.
    const somaTitulos = parseFloat(
      titulos.reduce((s: number, t: any) => s + Number(t.valor_bruto), 0).toFixed(2),
    );
    const fatorRemessa = somaTitulos > 0
      ? parseFloat((remessaValor / somaTitulos).toFixed(6))
      : 1;

    const blingParcelas = titulos.map((t: any) => ({
      dataVencimento: t.data_vencimento_original,
      valor: parseFloat((Number(t.valor_bruto) * fatorRemessa).toFixed(2)),
      formaPagamento: { id: Number(blingFormaId) },
    }));

    // Ajuste de centavo de arredondamento: soma exata = remessaValor
    const somaParcelas = blingParcelas.reduce((s, p) => s + p.valor, 0);
    const diff = parseFloat((remessaValor - somaParcelas).toFixed(2));
    if (Math.abs(diff) >= 0.01 && blingParcelas.length > 0) {
      blingParcelas[blingParcelas.length - 1].valor = parseFloat(
        (blingParcelas[blingParcelas.length - 1].valor + diff).toFixed(2),
      );
    }

    const totalExato = parseFloat(
      blingParcelas.reduce((s, p) => s + p.valor, 0).toFixed(2),
    );

    // 9. Sync de produtos: cache → Bling GET → Bling POST (auto-cadastro)
    const stripQtdSuffix = (d: string) =>
      (d || "").replace(/\s*\(\d+\s*un\.?\)\s*$/i, "").trim();

    const skusComCodigo = [...new Set(
      itens.map((it: any) => it.sku).filter(Boolean)
    )] as string[];

    const { data: cachedRows } = skusComCodigo.length > 0
      ? await supabase
          .from("bling_produtos_cache")
          .select("sku, bling_produto_id")
          .in("sku", skusComCodigo)
      : { data: [] };

    const cacheMap: Record<string, number> = {};
    for (const row of (cachedRows || [])) {
      cacheMap[row.sku] = row.bling_produto_id;
    }

    const novosCacheEntries: { sku: string; bling_produto_id: number; nome: string }[] = [];

    for (const it of itens) {
      if (!it.sku || cacheMap[it.sku]) continue;

      const nome = stripQtdSuffix(it.descricao);

      let blingProdId: number | null = null;
      const skuTrim = String(it.sku).trim();

      // Catálogo Bling é 100% plano (sem variação) e os nomes são genéricos/repetidos.
      // Casar por nome ou caçar "produto pai" é furada — pode resolver para o produto ERRADO.
      // O único campo confiável é o CÓDIGO. trim() dos dois lados: há código gravado com tab invisível.
      const acharPorCodigo = async (): Promise<number | null> => {
        // 1) filtro exato por código (Bling v3 aceita ?codigo=)
        try {
          const r = await client.get(`/produtos?codigo=${encodeURIComponent(skuTrim)}&limite=100`);
          const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
          if (m?.id) return m.id;
        } catch (_) {}
        // 2) fallback: busca por critério de código
        try {
          const r = await client.get(`/produtos?criterio=2&q=${encodeURIComponent(skuTrim)}&limite=100`);
          const m = (r?.data || []).find((p: any) => String(p.codigo || "").trim() === skuTrim);
          if (m?.id) return m.id;
        } catch (_) {}
        return null;
      };

      blingProdId = await acharPorCodigo();

      if (!blingProdId) {
        // Não existe no Bling: cria como produto simples (consistente com o catálogo plano).
        try {
          const created = await client.post("/produtos", {
            nome,
            codigo: skuTrim,
            tipo: "P",
            formato: "S",
            unidade: "UN",
            preco: parseFloat(Number(it.valor_unitario).toFixed(2)),
            situacao: "A",
          });
          const d = created?.data;
          blingProdId = d?.id ?? (typeof d === "number" ? d : null) ?? created?.id ?? null;
          if (!blingProdId) {
            console.error(`[produto-sync] POST /produtos ok mas sem id: sku=${skuTrim} resp=${JSON.stringify(created).slice(0, 500)}`);
          }
        } catch (e) {
          const errMsg = (e as Error).message || "";
          // "já cadastrado" (code 4): o código existe mas a busca não trouxe (ex.: tab no código).
          // Re-busca por código exato, em vez de caçar produto pai (que num catálogo plano resolve errado).
          if (errMsg.includes("já foi cadastrado") || errMsg.includes('"code":4')) {
            blingProdId = await acharPorCodigo();
            if (!blingProdId) {
              console.error(`[produto-sync] "já cadastrado" mas não localizei por código: sku=${skuTrim} err=${errMsg.slice(0, 300)}`);
            }
          } else {
            const errClean = errMsg.replace(/[\n\r]/g, " ").slice(0, 800);
            console.error(`[produto-sync] POST /produtos falhou: sku=${skuTrim} err=${errClean}`);
          }
        }
      }

      if (blingProdId) {
        cacheMap[it.sku] = blingProdId;
        novosCacheEntries.push({ sku: it.sku, bling_produto_id: blingProdId, nome });
      }
    }

if (novosCacheEntries.length > 0) {
  supabase
    .from("bling_produtos_cache")
    .upsert(novosCacheEntries, { onConflict: "sku" })
    .then(() => {})
    .catch(() => {});
}

// Guardrail pós-sync — FAIL-LOUD: produtos com SKU que não foram resolvidos
// (não encontrados nem criados no Bling) iriam como avulsos sem código.
// Bloqueamos o envio e listamos os produtos para correção manual.
const itensSemProdutoBling = itens.filter(
  (it: any) => it.sku && !cacheMap[it.sku]
);
if (itensSemProdutoBling.length > 0) {
  const nomes = itensSemProdutoBling
    .map((it: any) => `${it.descricao ?? "(sem descrição)"} [${it.sku}]`)
    .join(" | ");
  return err(
    `${itensSemProdutoBling.length} produto(s) não encontrado(s) nem criado(s) no Bling — ` +
    `verifique os logs do Bling e cadastre manualmente antes de reenviar: ${nomes}`,
    409,
  );
}

// 9d. Monta itens com produto.id (catálogo) ou fallback avulso
    // Frete da REMESSA (rateado na divisão) quando existir; senão o do pedido.
    // remessa.valor_frete = NULL em remessa não-dividida → usa pedido.valor_frete (comportamento original).
    const freteBase = remessa.valor_frete != null
      ? Number(remessa.valor_frete)
      : Number(pedido.valor_frete ?? 0);
    const valorFrete = freteBase > 0 ? freteBase : 0;

    const baseItens = valorFrete > 0
      ? Math.max(0, remessaValor - valorFrete)
      : remessaValor;

    // Soma real dos itens_json — denominador correto para o descontoFator.
    // Usar pedido.valor_bruto era incorreto: quando o desconto master é aplicado
    // só no total (não por linha), valor_bruto = valor_liquido e descontoFator = 1,
    // mas a soma dos itens pode ser maior — causando diff enorme e preço negativo
    // no último item. A soma real dos itens é sempre o denominador certo.
    const somaItensJson = parseFloat(
      itens.reduce((s: number, it: any) =>
        s + Number(it.valor_unitario) * Number(it.quantidade), 0
      ).toFixed(2)
    );

    const descontoFator =
      somaItensJson > 0 && baseItens < somaItensJson
        ? parseFloat((baseItens / somaItensJson).toFixed(6))
        : 1;

    const rawItens = itens.length > 0
      ? itens.map((it: any) => {
          const blingProdId = it.sku ? cacheMap[it.sku] : null;
          const qty = Number(it.quantidade);
          const lineTotal = parseFloat((Number(it.valor_unitario) * qty * descontoFator).toFixed(2));
          return {
            descricao: stripQtdSuffix(it.descricao),
            ...(blingProdId ? { produto: { id: blingProdId } } : {}),
            unidade: "UN",
            quantidade: qty,
            valor: parseFloat((lineTotal / qty).toFixed(4)),
          };
        })
      : null;

    const totalProdutosCalc = rawItens
      ? parseFloat(
          rawItens
            .reduce((s, it) => s + parseFloat((it.valor * it.quantidade).toFixed(2)), 0)
            .toFixed(2),
        )
      : totalExato;

    const totalProdutosPayload = rawItens
      ? parseFloat((totalExato - valorFrete).toFixed(2))
      : totalExato;

    const diffItens = parseFloat((totalProdutosPayload - totalProdutosCalc).toFixed(2));

    // Guardrail diff — FAIL-LOUD: diferença > R$ 5,00 indica inconsistência
    // real nos preços (ex: itens_json com preço tabela vs valor_liquido com desconto).
    // Se silenciado, a diferença cai inteira no último item gerando preço negativo.
    // Corrija a origem dos preços em itens_json antes de reenviar.
    if (Math.abs(diffItens) > 5.00) {
      return err(
        `Inconsistência de valor: diferença de R$ ${Math.abs(diffItens).toFixed(2)} entre ` +
        `soma dos itens (R$ ${totalProdutosCalc.toFixed(2)}) e valor do pedido ` +
        `(R$ ${totalProdutosPayload.toFixed(2)}). ` +
        `Verifique os preços nos itens_json da remessa — provável uso de preço tabela onde se espera preço descontado.`,
        409,
      );
    }

    // Ajuste de centavos de arredondamento (|diff| <= R$ 5,00): aplica no último item
    if (Math.abs(diffItens) >= 0.01 && rawItens && rawItens.length > 0) {
      const last = rawItens[rawItens.length - 1];
      const valorLinhaAjustado = parseFloat(
        (last.valor * last.quantidade + diffItens).toFixed(2)
      );
      last.valor = parseFloat((valorLinhaAjustado / last.quantidade).toFixed(4));
    }

    const blingItens = rawItens ?? [{
      descricao: `Pedido FOP #${remessaCodigo}`,
      quantidade: 1,
      valor: totalExato,
    }];

    const obsPartes: string[] = [];
    if (transpNome) obsPartes.push(`Transportadora: ${transpNome}${transpCnpj ? ` | CNPJ: ${transpCnpj}` : ""}`);
    if (valorFrete > 0) obsPartes.push(`Frete ${pedido.frete_tipo || ""}${pedido.frete_tipo ? ":" : ""} R$ ${valorFrete.toFixed(2)}`);
    const obsInternas = obsPartes.length > 0 ? obsPartes.join(" | ") : undefined;

    const payload: Record<string, any> = {
      numeroLoja: remessaCodigo,
      data: pedido.data_pedido,
      contato: { id: Number(parceiro.bling_id) },
      ...(blingLojaId ? { loja: { id: blingLojaId }, canal: { id: blingLojaId } } : {}),
      itens: blingItens,
      parcelas: blingParcelas,
      totalProdutos: totalProdutosPayload,
      total: totalExato,
      observacoes: pedido.contexto_anotacoes || `Pedido ${remessaCodigo} via SNCF`,
      ...(obsInternas ? { observacoesInternas: obsInternas } : {}),
    };

    const tipoFrete = valorFrete === 0 ? 9 : (pedido.frete_tipo === "FOB" ? 1 : 0);
    const pesoReal = Number(pedido.peso_bruto_total ?? 0);

    if (transpNome || valorFrete > 0 || pesoReal > 0) {
      payload.transporte = {
        fretePorConta: tipoFrete,
        ...(blingTransportadoraId ? { transportadora: blingTransportadoraId } : transpNome ? { transportadora: { nome: transpNome } } : {}),
        ...(valorFrete > 0 ? { frete: parseFloat(valorFrete.toFixed(2)) } : {}),
        ...(pesoReal > 0 ? { pesoBruto: parseFloat(pesoReal.toFixed(3)) } : {}),
        ...(pesoReal > 0 ? { pesoLiquido: parseFloat(pesoReal.toFixed(3)) } : {}),
      };
    }

    // 10. POST Bling
    let blingId: number | null = null;
    let respStatus: number | null = null;
    let respBody: any = null;
    let sucesso = false;
    let erroMsg: string | null = null;

    try {
      const resposta = await client.post("/pedidos/vendas", payload);
      respBody = resposta;
      blingId = resposta?.data?.id ?? resposta?.id ?? null;
      sucesso = !!blingId;
      respStatus = 200;
      if (!sucesso) erroMsg = "Bling retornou sem id de pedido";
    } catch (e) {
      erroMsg = (e as Error).message;
      sucesso = false;
      const m = erroMsg?.match(/(\d{3}):/);
      if (m) respStatus = parseInt(m[1]);
    }

    const duracaoMs = Date.now() - t0;

    // 11. Log
    await supabase.from("bling_envios_log").insert({
      pedido_id,
      enviado_por: userId,
      payload_enviado: payload,
      resposta_status: respStatus,
      resposta_body: respBody,
      bling_id_retornado: blingId,
      sucesso,
      erro_msg: erroMsg,
      duracao_ms: duracaoMs,
    });

    if (sucesso) {
      // 12a. Atualiza remessa
      await supabase.from("pedido_remessa").update({
        bling_pedido_id: String(blingId),
        status: "enviada_bling",
      }).eq("id", remessa.id);

      // 12b. Carimba pedido apenas na primeira remessa enviada
      if (!pedido.bling_id_destino) {
        await supabase.from("pedidos").update({
          bling_id_destino: blingId,
          bling_enviado_em: new Date().toISOString(),
          bling_enviado_por: userId,
          bling_envio_erro: null,
        }).eq("id", pedido_id);
      }

      // 12c. Transição de estágio — se em pre_faturado ou pre_separacao
      let avisoTransicao: string | undefined;
      if (["pre_faturado", "pre_separacao"].includes(pedido.estagio)) {
        const { error: errTransicao } = await supabase.rpc("transicionar_pedido" as string, {
          p_pedido_id: pedido_id,
          p_para_estagio: "em_separacao",
          p_proxima_acao: "Pedido no armazém — aguardar NF",
          p_motivo: `Remessa ${remessaCodigo} enviada ao Bling (id ${blingId})`,
        });
        if (errTransicao) {
          console.error(`[enviar-pedido-bling] transicionar_pedido falhou: ${errTransicao.message}`);
          avisoTransicao = `Pedido enviado ao Bling mas estágio não avançou automaticamente — ${errTransicao.message}`;
        }
      }

      return ok({
        sucesso: true,
        bling_id: blingId,
        remessa_id: remessa.id,
        remessa_codigo: remessaCodigo,
        mensagem: `Remessa ${remessaCodigo} enviada pro Bling (id ${blingId})`,
        ...(avisoTransicao ? { aviso_transicao: avisoTransicao } : {}),
        duracao_ms: duracaoMs,
      });
    } else {
      await supabase.from("pedidos").update({
        bling_envio_erro: erroMsg,
      }).eq("id", pedido_id);

      return err(erroMsg || "Falha ao enviar pro Bling", 502);
    }
  } catch (e) {
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});
