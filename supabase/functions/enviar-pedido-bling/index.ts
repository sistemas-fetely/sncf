// Edge Function: enviar-pedido-bling
// F-3.3 — POST /pedidos/vendas no Bling a partir de pedido em pre_faturado.
// Idempotente via pedido.bling_id_destino. Log em bling_envios_log.

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
    if (!pedido_id) return err("pedido_id obrigatório");

    // 1. Pedido
    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .select("*")
      .eq("id", pedido_id)
      .maybeSingle();
    if (pedErr || !pedido) return err("Pedido não encontrado", 404);

    if (pedido.estagio !== "pre_faturado") {
      return err(`Pedido em estágio "${pedido.estagio}" — só envia em pre_faturado`);
    }
    if (pedido.bling_id_destino) {
      return err(`Pedido já enviado pro Bling (id ${pedido.bling_id_destino})`, 409);
    }

    // 2. Parceiro
    const { data: parceiro } = await supabase
      .from("parceiros_comerciais")
      .select("id, bling_id, razao_social, cnpj")
      .eq("id", pedido.parceiro_id)
      .maybeSingle();
    if (!parceiro?.bling_id) {
      return err("Parceiro sem bling_id — sincronize o parceiro no Bling antes", 409);
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
    // Nota: bling_id_forma_pagamento pode ser null aqui — lookup dinâmico abaixo resolve.

    // 4. Títulos
    const { data: titulos } = await supabase
      .from("titulo_a_receber")
      .select("id, numero_parcela, valor_bruto, data_vencimento_original, tipo_pagamento, eh_entrada")
      .eq("pedido_id", pedido_id)
      .order("numero_parcela");
    if (!titulos || titulos.length === 0) {
      return err("Pedido sem títulos gerados — engine F-2 deveria ter gerado em pre_faturado", 409);
    }

    // 5. Itens individuais do pedido
    const { data: itens } = await supabase
      .from("pedido_itens")
      .select("descricao, sku, quantidade, valor_unitario")
      .eq("pedido_id", pedido_id)
      .order("ordem");

    // 6. Config Bling + cliente
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
    // GET /formas-pagamentos retorna as formas reais desta conta.
    // Isso resolve IDs desatualizados em formas_pagamento.bling_id_forma_pagamento.
    const FORMA_KEYWORDS: Record<string, string[]> = {
      boleto:         ["boleto"],
      pix:            ["pix"],
      transferencia:  ["transferência", "transferencia", "ted", "doc"],
      cartao_credito: ["crédito", "credito"],
      cartao_debito:  ["débito", "debito"],
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
        // Auto-corrige o banco se o ID mudou
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

    // 8. Parcelas (uma por título)
    // Arredonda para 2 casas antes de somar (valor_bruto pode ter mais casas no banco).
    const blingParcelas = titulos.map((t: any) => ({
      dataVencimento: t.data_vencimento_original,
      valor: parseFloat(Number(t.valor_bruto).toFixed(2)),
      formaPagamento: { id: Number(blingFormaId) },
    }));

    // Ajuste de centavos na última parcela
    const somaParcelas = blingParcelas.reduce((s, p) => s + p.valor, 0);
    const diff = parseFloat((Number(pedido.valor_liquido) - somaParcelas).toFixed(2));
    if (Math.abs(diff) >= 0.01 && blingParcelas.length > 0) {
      blingParcelas[blingParcelas.length - 1].valor = parseFloat(
        (blingParcelas[blingParcelas.length - 1].valor + diff).toFixed(2),
      );
    }

    // Total exato = sum das parcelas após ajuste (garante consistência com Bling)
    const totalExato = parseFloat(
      blingParcelas.reduce((s, p) => s + p.valor, 0).toFixed(2),
    );

    // 9. Sync de produtos: cache → Bling GET → Bling POST (auto-cadastro)
    // Garante que cada item tenha produto.id no Bling antes do pedido de venda.
    // bling_produtos_cache evita chamadas repetidas para produtos já sincronizados.
    const stripQtdSuffix = (d: string) =>
      (d || "").replace(/\s*\(\d+\s*un\.?\)\s*$/i, "").trim();

    // 9a. Bulk lookup no cache local
    const skusComCodigo = [...new Set(
      (itens || []).map((it: any) => it.sku).filter(Boolean)
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

    // 9b. Para SKUs não em cache: GET no Bling → se não existir → POST /produtos
    const novosCacheEntries: { sku: string; bling_produto_id: number; nome: string }[] = [];

    for (const it of (itens || [])) {
      if (!it.sku || cacheMap[it.sku]) continue;

      const nome = stripQtdSuffix(it.descricao);
      const skuEncoded = encodeURIComponent(it.sku);

      // Tenta encontrar no Bling pelo código
      let blingId: number | null = null;
      try {
        const found = await client.get(`/produtos?criterio=2&q=${skuEncoded}&limite=5`);
        const match = (found?.data || []).find(
          (p: any) => p.codigo === it.sku || p.codigo?.toLowerCase() === it.sku.toLowerCase()
        );
        if (match?.id) blingId = match.id;
      } catch (_) { /* segue para criação */ }

      // Se não encontrou: cria no Bling
      if (!blingId) {
        try {
          const created = await client.post("/produtos", {
            nome,
            codigo: it.sku,
            tipo: "P",
            unidade: "UN",
            preco: parseFloat(Number(it.valor_unitario).toFixed(2)),
            situacao: "A",
          });
          blingId = created?.data?.id ?? created?.id ?? null;
        } catch (_) { /* item ficará sem produto.id — enviado como avulso */ }
      }

      if (blingId) {
        cacheMap[it.sku] = blingId;
        novosCacheEntries.push({ sku: it.sku, bling_produto_id: blingId, nome });
      }
    }

    // 9c. Persiste novas entradas no cache (fire-and-forget — não bloqueia o envio)
    if (novosCacheEntries.length > 0) {
      supabase
        .from("bling_produtos_cache")
        .upsert(novosCacheEntries, { onConflict: "sku" })
        .then(() => {})
        .catch(() => {});
    }

    // 9d. Monta itens com produto.id (catálogo) ou fallback avulso
    const rawItens = (itens && itens.length > 0)
      ? itens.map((it: any) => {
          const blingProdId = it.sku ? cacheMap[it.sku] : null;
          return {
            descricao: stripQtdSuffix(it.descricao),
            ...(blingProdId
              ? { produto: { id: blingProdId } }           // produto cadastrado → sem aviso
              : it.sku ? { codigo: it.sku } : {}),          // fallback: código ou avulso
            unidade: "UN",
            quantidade: Number(it.quantidade),
            valor: parseFloat(Number(it.valor_unitario).toFixed(2)),
          };
        })
      : null;

    // totalProdutos = sum de cada linha (qtd × valor), arredondado por linha
    const totalProdutosCalc = rawItens
      ? parseFloat(
          rawItens
            .reduce((s, it) => s + parseFloat((it.valor * it.quantidade).toFixed(2)), 0)
            .toFixed(2),
        )
      : totalExato;

    // descontoValor: garante totalProdutos - desconto = totalExato = sum(parcelas)
    const descontoValor = parseFloat((totalProdutosCalc - totalExato).toFixed(2));

    const blingItens = rawItens ?? [{
      descricao: `Pedido FOP #${pedido.id_externo}`,
      quantidade: 1,
      valor: totalExato,
    }];

    // 10. Payload final
    const payload: Record<string, any> = {
      numeroLoja: pedido.id_externo,
      data: pedido.data_pedido,
      contato: { id: Number(parceiro.bling_id) },
      itens: blingItens,
      parcelas: blingParcelas,
      totalProdutos: rawItens ? totalProdutosCalc : totalExato,
      total: totalExato,
      observacoes: pedido.contexto_anotacoes || `Pedido ${pedido.id_externo} via SNCF`,
    };

    if (descontoValor >= 0.01) {
      payload.desconto = { tipo: "VALOR", valor: descontoValor };
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
      // 12. Carimba pedido
      await supabase.from("pedidos").update({
        bling_id_destino: blingId,
        bling_enviado_em: new Date().toISOString(),
        bling_enviado_por: userId,
        bling_envio_erro: null,
      }).eq("id", pedido_id);

      return ok({
        sucesso: true,
        bling_id: blingId,
        mensagem: `Pedido enviado pro Bling (id ${blingId})`,
        duracao_ms: duracaoMs,
      });
    } else {
      // 13. Carimba erro no pedido (sem mover estágio)
      await supabase.from("pedidos").update({
        bling_envio_erro: erroMsg,
      }).eq("id", pedido_id);

      return err(erroMsg || "Falha ao enviar pro Bling", 502);
    }
  } catch (e) {
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});
