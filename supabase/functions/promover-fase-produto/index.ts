// Ato humano de mudar a fase do produto.
// O SNCF decide (portoes de ficha, saldo, um degrau por vez); o FOP e o mestre do dado.
// Nenhum caminho devolve ok sem o FOP ter aceitado (POST no endpoint inbound sincronizar-catalogo).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Auth por sessao
    const auth = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!auth) return json({ ok: false, erro: "Não autorizado" }, 401);
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      auth.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) return json({ ok: false, erro: "Não autorizado" }, 401);

    let body: any = null;
    try {
      body = await req.json();
    } catch (_) {
      return json({ ok: false, erro: "Body JSON inválido" }, 400);
    }

    // Branch registrar_pi: a Importação de PI manda os itens já julgados pelo
    // cartório e o FOP decide se cada produto nasce. Nada aqui reinterpreta
    // identidade — só repassa a resposta da fn_registrar_produtos_cartorio.
    // A RPC fn_registrar_produtos_cartorio vive no FOP porque e la que o produto nasce (FOP-E-VERDADE-DO-CADASTRO). Cria com identidade so: cod_cadastro, sku, ean, marca. Classificacao e nome_comercial vem na PRE-VENDA.
    if (body?.tipo === "registrar_pi") {
      const itens = body?.itens;
      if (!Array.isArray(itens) || itens.length === 0) {
        return json({ ok: false, erro: "itens obrigatório (array não vazio)" }, 400);
      }
      if (itens.length > 200) {
        return json({ ok: false, erro: "limite de 200 itens por chamada excedido" }, 400);
      }
      const dryRun = body?.dry_run !== false;

      // Transporte: endpoint inbound do FOP (ja autentica) — a chave de servico
      // do REST nunca foi preenchida (placeholder de template). Token compartilhado
      // do vault, nunca do env. O julgamento dos itens continua sendo do cartorio;
      // aqui so repassa a resposta.
      const { data: fopToken, error: errVault } = await supabase.rpc("get_vault_secret", {
        p_name: "FOP_INBOUND_TOKEN",
      });
      if (errVault || !fopToken) {
        console.error("[promover-fase-produto] registrar_pi: vault falhou", errVault);
        throw new Error(
          `FOP_INBOUND_TOKEN indisponível no vault${errVault ? `: ${errVault.message}` : ""}`,
        );
      }

      const respPi = await fetch(`${FOP_URL}/functions/v1/sincronizar-catalogo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${fopToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ modo: "registrar_pi", itens, dry_run: dryRun }),
      });

      const corpoPi = await respPi.text();
      let j: Record<string, unknown> = {};
      try {
        j = JSON.parse(corpoPi) as Record<string, unknown>;
      } catch {
        j = {};
      }
      if (respPi.status === 401) {
        console.error("[promover-fase-produto] registrar_pi: FOP recusou o token inbound", corpoPi);
        throw new Error("O token de entrada do FOP foi recusado — configuração a revisar, não é erro do cadastro.");
      }
      if (!respPi.ok || j.ok !== true) {
        console.error("[promover-fase-produto] registrar_pi: FOP recusou", respPi.status, corpoPi);
        throw new Error(
          `registrar_pi no FOP: HTTP ${respPi.status} ${typeof j.erro_banco === "string" ? j.erro_banco : corpoPi}`,
        );
      }

      console.log("[promover-fase-produto] registrar_pi ok", { itens: itens.length, dryRun });
      return json({ ok: true, tipo: "registrar_pi", resultado: j.resultado ?? j });
    }

    // Guarda de permissao: so o modo "mudar fase" exige acao.produto_promover_fase;
    // o branch registrar_pi acima continua livre.
    const { data: pode } = await supabase.rpc("usuario_tem_acao", {
      p_slug: "acao.produto_promover_fase",
      p_user_id: userData.user.id,
    });
    if (!pode) {
      // Registra a tentativa negada antes de devolver o 403; falha aqui nao muda a resposta.
      const skuTentado = typeof body?.sku === "string" ? body.sku.trim() : "";
      if (skuTentado) {
        const { error: errNegado } = await supabase.from("produto_fase_evento").insert({
          sku: skuTentado,
          fase_de: null,
          fase_para: typeof body?.fase_destino === "string" ? body.fase_destino.trim() || null : null,
          ator_id: userData.user.id,
          motivo: typeof body?.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null,
          origem: "negado",
        });
        if (errNegado) console.error("[promover-fase-produto] falha ao registrar tentativa negada", errNegado);
      }
      return json({ ok: false, erro: "Sem permissão para esta ação (acao.produto_promover_fase)." }, 403);
    }

    const sku = typeof body?.sku === "string" ? body.sku.trim() : "";
    const faseDestino = typeof body?.fase_destino === "string" ? body.fase_destino.trim() : "";
    const confirmarSaldo = body?.confirmar_saldo === true;

    if (!sku) return json({ ok: false, erro: "sku obrigatório" }, 400);
    if (!faseDestino) return json({ ok: false, erro: "fase_destino obrigatório" }, 400);

    console.log("[promover-fase-produto] pedido", { sku, faseDestino, confirmarSaldo });

    // 2) DEFAULT-DENY: a fase precisa existir na dimensao
    const { data: fases, error: errFases } = await supabase
      .from("produto_fase_dim")
      .select("slug, ordem");
    if (errFases) {
      console.error("[promover-fase-produto] erro lendo produto_fase_dim", errFases);
      return json({ ok: false, erro: errFases.message }, 500);
    }
    const faseAlvo = (fases ?? []).find((f: any) => f.slug === faseDestino);
    if (!faseAlvo) {
      return json({ ok: false, erro: `Fase desconhecida: ${faseDestino}` }, 400);
    }

    // 3) Situacao atual do produto
    const { data: linha, error: errLinha } = await supabase
      .from("vw_produto_mesa_fase")
      .select("fase, fase_ordem, falta_proxima_fase, saldo_disponivel, cod_cadastro, nome_comercial, tem_bling")
      .eq("sku", sku)
      .maybeSingle();
    if (errLinha) {
      console.error("[promover-fase-produto] erro lendo vw_produto_mesa_fase", errLinha);
      return json({ ok: false, erro: errLinha.message }, 500);
    }
    if (!linha) return json({ ok: false, erro: `Produto não encontrado: ${sku}` }, 404);

    const faseAnterior: string | null = (linha as any).fase ?? null;
    const ordemAtual = Number((linha as any).fase_ordem ?? 0);
    const ordemDestino = Number(faseAlvo.ordem ?? 0);
    const faltando = (linha as any).falta_proxima_fase;
    const camposFaltando: string[] = Array.isArray(faltando)
      ? faltando
      : typeof faltando === "string" && faltando.trim().length > 0
        ? faltando.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    const saldoDisponivel = Number((linha as any).saldo_disponivel ?? 0);

    console.log("[promover-fase-produto] estado", {
      faseAnterior, ordemAtual, ordemDestino, camposFaltando, saldoDisponivel,
    });

    // 4) Promocao: um degrau por vez e ficha completa
    if (ordemDestino > ordemAtual) {
      if (ordemDestino !== ordemAtual + 1) {
        return json(
          { ok: false, erro: "Pulo de fase não permitido: promova um degrau por vez" },
          400,
        );
      }
      if (camposFaltando.length > 0) {
        return json(
          { ok: false, erro: "Ficha incompleta para a próxima fase", campos_faltando: camposFaltando },
          422,
        );
      }
    }

    // 5) Descontinuar com saldo: avisa, nao bloqueia de vez
    if (faseDestino === "inativo" && saldoDisponivel > 0 && !confirmarSaldo) {
      return json(
        {
          ok: false,
          erro: "Produto ainda tem saldo disponível. Reenvie com confirmar_saldo: true para descontinuar mesmo assim.",
          saldo_disponivel: saldoDisponivel,
        },
        409,
      );
    }

    // 6) Regressao (ordem menor) e sempre livre.

    // 7) Escrita no mestre: FOP, via endpoint inbound que ja autentica.
    //    As regras de fase continuam todas aqui — o FOP e so o braco de escrita.
    const { data: fopToken, error: errVault } = await supabase.rpc("get_vault_secret", {
      p_name: "FOP_INBOUND_TOKEN",
    });
    if (errVault || !fopToken) {
      console.error("[promover-fase-produto] vault falhou", errVault);
      return json(
        {
          ok: false,
          erro: `FOP_INBOUND_TOKEN indisponível no vault${errVault ? `: ${errVault.message}` : ""}`,
        },
        500,
      );
    }

    const respFop = await fetch(`${FOP_URL}/functions/v1/sincronizar-catalogo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fopToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        modo: "promover_fase",
        sku,
        fase: faseDestino,
        motivo: "promoção pela Mesa do Produto",
      }),
    });

    const corpoFop = await respFop.text();
    let fopJson: Record<string, unknown> | null = null;
    try {
      fopJson = JSON.parse(corpoFop) as Record<string, unknown>;
    } catch {
      fopJson = null;
    }

    if (respFop.status === 401) {
      // Falha de configuracao (token recusado), nao do usuario.
      console.error("[promover-fase-produto] FOP recusou o token inbound", corpoFop);
      return json(
        { ok: false, erro: "O token de entrada do FOP foi recusado — configuração a revisar, não é erro do cadastro.", fop_status: 401, fop_body: corpoFop },
        502,
      );
    }

    if (respFop.status === 404) {
      console.error("[promover-fase-produto] produto nao encontrado no FOP", corpoFop);
      return json({ ok: false, erro: "Produto não encontrado no FOP", fop_body: corpoFop }, 404);
    }

    if (!respFop.ok || fopJson?.ok !== true) {
      // 502 do FOP traz erro_banco da gate_fase (lista os campos faltando): devolve CRU.
      console.error("[promover-fase-produto] FOP recusou", respFop.status, corpoFop);
      return json(
        {
          ok: false,
          erro: "FOP recusou a mudança de fase",
          fop_status: respFop.status,
          fop_body: typeof fopJson?.erro_banco === "string" ? fopJson.erro_banco : corpoFop,
        },
        502,
      );
    }

    console.log("[promover-fase-produto] FOP aceitou", sku, faseDestino);

    // 8) espelho otimista — o sync das 03:00 reconcilia; o FOP é o mestre.
    //    fase_alterada_por/motivo sao "carimbo de passagem": o trigger
    //    trg_produto_fase_evento le, grava o evento em produto_fase_evento e zera.
    const { error: errEspelho } = await (supabase as any)
      .from("sncf_produtos")
      .update({
        fase: faseDestino,
        fase_alterada_por: userData.user.id,
        fase_alterada_motivo:
          typeof body?.motivo === "string" && body.motivo.trim() ? body.motivo.trim() : null,
      })
      .eq("sku", sku);
    if (errEspelho) {
      console.error("[promover-fase-produto] falha no espelho local", errEspelho);
      return json({ ok: false, erro: `FOP aceitou, mas o espelho local falhou: ${errEspelho.message}` }, 500);
    }

    // 9)
    return json({
      ok: true,
      sku,
      cod_cadastro: (linha as any).cod_cadastro ?? null,
      de: faseAnterior,
      para: faseDestino,
      saldo_disponivel: saldoDisponivel,
    });
  } catch (e) {
    console.error("[promover-fase-produto] erro inesperado", e);
    return json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, 500);
  }
});
