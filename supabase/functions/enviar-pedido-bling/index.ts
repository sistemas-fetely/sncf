// Edge Function: enviar-pedido-bling
// F-3.3 — POST /pedidos/vendas no Bling a partir de pedido em pre_faturado.
// Idempotente via pedido.bling_id_destino. Log em bling_envios_log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { ensureFreshToken, makeBlingClient } from "../sync-bling-financeiro/bling-client.ts";

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
    if (!parceiro) return err("Parceiro do pedido não encontrado", 404);
    if (!parceiro.bling_id) {
      return err(
        `Parceiro "${parceiro.razao_social}" sem bling_id — rodar sync_contatos antes`,
        409,
      );
    }

    // 3. Forma de pagamento (match por codigo)
    const { data: forma } = await supabase
      .from("formas_pagamento")
      .select("id, codigo, bling_id_forma_pagamento")
      .eq("codigo", pedido.forma_solicitada)
      .maybeSingle();
    if (!forma) {
      return err(`Forma de pagamento "${pedido.forma_solicitada}" não encontrada em formas_pagamento`, 409);
    }
    if (!forma.bling_id_forma_pagamento) {
      return err(
        `Forma "${forma.codigo}" sem bling_id_forma_pagamento parametrizado — peça pro admin configurar`,
        409,
      );
    }

    // 4. Títulos
    const { data: titulos } = await supabase
      .from("titulo_a_receber")
      .select("id, numero_parcela, valor_bruto, data_vencimento_original, tipo_pagamento, eh_entrada")
      .eq("pedido_id", pedido_id)
      .order("numero_parcela");
    if (!titulos || titulos.length === 0) {
      return err("Pedido sem títulos gerados — engine F-2 deveria ter gerado em pre_faturado", 409);
    }

    // 5. Itens (estruturados ou fallback genérico)
    const { data: itens } = await supabase
      .from("pedido_itens")
      .select("descricao, sku, quantidade, valor_unitario")
      .eq("pedido_id", pedido_id)
      .order("ordem");

    const blingItens = (itens && itens.length > 0)
      ? itens.map((it: any) => ({
          descricao: it.descricao,
          codigo: it.sku || undefined,
          quantidade: Number(it.quantidade),
          valor: Number(it.valor_unitario),
        }))
      : [{
          descricao: `Pedido FOP #${pedido.id_externo}`,
          quantidade: 1,
          valor: Number(pedido.valor_liquido),
        }];

    // 6. Parcelas (uma por título)
    const blingParcelas = titulos.map((t: any) => ({
      dataVencimento: t.data_vencimento_original,
      valor: Number(t.valor_bruto),
      formaPagamento: { id: Number(forma.bling_id_forma_pagamento) },
    }));

    // 7. Payload final
    const payload = {
      numeroLoja: pedido.id_externo,
      data: pedido.data_pedido,
      contato: { id: Number(parceiro.bling_id) },
      itens: blingItens,
      parcelas: blingParcelas,
      totalProdutos: Number(pedido.valor_liquido),
      total: Number(pedido.valor_liquido),
      observacoes: pedido.contexto_anotacoes || `Pedido ${pedido.id_externo} via SNCF`,
    };

    // 8. Config Bling
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

    // 9. POST Bling
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

    // 10. Log
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
      // 11. Carimba pedido
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
      // 12. Carimba erro no pedido (sem mover estágio)
      await supabase.from("pedidos").update({
        bling_envio_erro: erroMsg,
      }).eq("id", pedido_id);

      return err(erroMsg || "Falha ao enviar pro Bling", 502);
    }
  } catch (e) {
    return err(`Erro inesperado: ${(e as Error).message}`, 500);
  }
});
