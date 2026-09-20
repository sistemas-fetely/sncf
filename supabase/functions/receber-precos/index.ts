// receber-precos — recebe do FOP o espelho da tabela de preço:
// vigências (product_prices) e histórico (product_price_history).
// Escrita SOMENTE em fop_preco_vigencia e fop_preco_historico — nunca em
// sncf_produtos, nunca no FOP. Padrão: recebe-pedido (CORS, FOP_INBOUND_TOKEN
// no vault, service role, resposta com contagem).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const TAMANHO_BLOCO = 500;
const TETO_ERROS = 50;

interface ErroBloco {
  tabela: string;
  ids: string[];
  erro: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Método não permitido. Use POST." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corpo JSON malformado" });
    }

    // ── Autenticação: mesmo token de entrada do recebe-pedido (vault) ──
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authorization Bearer ausente ou malformado" });
    }
    const senhaRecebida = authHeader.substring(7).trim();

    const { data: senhaEsperada, error: vaultError } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });

    if (vaultError || !senhaEsperada) {
      console.error("[receber-precos] Falha ao ler senha do cofre", vaultError);
      return jsonResponse(500, { error: "Erro de configuração interna" });
    }

    if (senhaRecebida !== senhaEsperada) {
      console.warn("[receber-precos] Senha inválida");
      return jsonResponse(401, { error: "Senha inválida" });
    }

    const vigencias = Array.isArray(body?.vigencias) ? body.vigencias : [];
    const historico = Array.isArray(body?.historico) ? body.historico : [];

    if (vigencias.length === 0 && historico.length === 0) {
      return jsonResponse(400, {
        error: "Payload vazio",
        detalhe: "envie ao menos um dos arrays: vigencias ou historico",
      });
    }

    const erros: ErroBloco[] = [];
    let errosOmitidos = 0;
    let gravadosVigencias = 0;
    let gravadosHistorico = 0;

    const registrarErro = (tabela: string, ids: string[], erro: unknown) => {
      console.error(`[receber-precos] falha no upsert de ${tabela}`, { ids, erro });
      if (erros.length < TETO_ERROS) {
        erros.push({
          tabela,
          ids,
          erro: typeof erro === "object" && erro !== null && "message" in erro
            ? String((erro as { message: unknown }).message)
            : JSON.stringify(erro),
        });
      } else {
        errosOmitidos++;
      }
    };

    // espelhado_em é preenchido pelo banco (default/trigger) — não enviar.
    // criado_por_nome / alterado_por_nome vão como vieram, nulos inclusive:
    // trigger no banco converte nulo para 'indeterminado'.

    // ── Vigências: upsert por id (uuid do FOP), blocos de 500 ──
    for (let i = 0; i < vigencias.length; i += TAMANHO_BLOCO) {
      const bloco = vigencias.slice(i, i + TAMANHO_BLOCO).map((v: any) => ({
        id: v.id,
        product_id: v.product_id ?? null,
        cod_cadastro: v.cod_cadastro ?? null,
        sku: v.sku ?? null,
        preco_atacado: v.preco_atacado ?? null,
        preco_varejo: v.preco_varejo ?? null,
        vigencia_inicio: v.vigencia_inicio ?? null,
        vigencia_fim: v.vigencia_fim ?? null,
        ativo: v.ativo ?? null,
        observacao: v.observacao ?? null,
        criado_por_nome: v.criado_por_nome ?? null,
        created_at: v.created_at ?? null,
        updated_at: v.updated_at ?? null,
      }));

      const { error } = await supabase
        .from("fop_preco_vigencia")
        .upsert(bloco, { onConflict: "id" });

      if (error) {
        registrarErro("fop_preco_vigencia", bloco.map((v: any) => String(v.id)), error);
      } else {
        gravadosVigencias += bloco.length;
      }
    }

    // ── Histórico: upsert por id (uuid do FOP), blocos de 500 ──
    for (let i = 0; i < historico.length; i += TAMANHO_BLOCO) {
      const bloco = historico.slice(i, i + TAMANHO_BLOCO).map((h: any) => ({
        id: h.id,
        product_id: h.product_id ?? null,
        cod_cadastro: h.cod_cadastro ?? null,
        sku: h.sku ?? null,
        nome_comercial: h.nome_comercial ?? null,
        preco_atacado_anterior: h.preco_atacado_anterior ?? null,
        preco_varejo_anterior: h.preco_varejo_anterior ?? null,
        preco_atacado_novo: h.preco_atacado_novo ?? null,
        preco_varejo_novo: h.preco_varejo_novo ?? null,
        variacao_atacado_percent: h.variacao_atacado_percent ?? null,
        variacao_varejo_percent: h.variacao_varejo_percent ?? null,
        acao: h.acao ?? null,
        alterado_por_nome: h.alterado_por_nome ?? null,
        observacao: h.observacao ?? null,
        criado_em: h.criado_em ?? null,
      }));

      const { error } = await supabase
        .from("fop_preco_historico")
        .upsert(bloco, { onConflict: "id" });

      if (error) {
        registrarErro("fop_preco_historico", bloco.map((h: any) => String(h.id)), error);
      } else {
        gravadosHistorico += bloco.length;
      }
    }

    console.log(
      `[receber-precos] vigencias=${gravadosVigencias}/${vigencias.length} historico=${gravadosHistorico}/${historico.length} erros=${erros.length + errosOmitidos}`
    );

    if (gravadosVigencias + gravadosHistorico === 0) {
      return jsonResponse(500, {
        ok: false,
        error: "Nada foi gravado",
        vigencias: 0,
        historico: 0,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    if (erros.length > 0 || errosOmitidos > 0) {
      return jsonResponse(200, {
        ok: false,
        vigencias: gravadosVigencias,
        historico: gravadosHistorico,
        erros,
        erros_omitidos: errosOmitidos,
      });
    }

    return jsonResponse(200, {
      ok: true,
      vigencias: gravadosVigencias,
      historico: gravadosHistorico,
    });
  } catch (err) {
    console.error("[receber-precos] Erro inesperado", err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : "Erro interno",
    });
  }
});
