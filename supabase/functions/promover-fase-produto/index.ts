// Ato humano de mudar a fase do produto.
// O SNCF decide (portoes de ficha, saldo, um degrau por vez); o FOP e o mestre do dado.
// Nenhum caminho devolve ok sem o PATCH no FOP ter dado certo.

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

    // 7) Escrita no mestre: FOP
    const { data: fopKey } = await supabase.rpc("get_vault_secret", {
      p_name: "FOP_SERVICE_ROLE_KEY",
    });
    if (!fopKey) {
      console.error("[promover-fase-produto] FOP_SERVICE_ROLE_KEY ausente no vault");
      return json({ ok: false, erro: "FOP_SERVICE_ROLE_KEY não configurado no vault" }, 500);
    }

    const respFop = await fetch(
      `${FOP_URL}/rest/v1/products?sku=eq.${encodeURIComponent(sku)}`,
      {
        method: "PATCH",
        headers: {
          apikey: fopKey,
          Authorization: `Bearer ${fopKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ fase: faseDestino }),
      },
    );

    if (!respFop.ok) {
      // O corpo do FOP e a mensagem da trigger de la (lista os campos faltando): devolve na integra.
      const corpo = await respFop.text();
      console.error("[promover-fase-produto] FOP recusou", respFop.status, corpo);
      return json({ ok: false, erro: "FOP recusou a mudança de fase", fop_status: respFop.status, fop_body: corpo }, 502);
    }

    console.log("[promover-fase-produto] FOP aceitou", sku, faseDestino);

    // 8) espelho otimista — o sync das 03:00 reconcilia; o FOP é o mestre
    const { error: errEspelho } = await (supabase as any)
      .from("sncf_produtos")
      .update({ fase: faseDestino })
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
