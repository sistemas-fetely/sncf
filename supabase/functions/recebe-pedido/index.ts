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
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Authorization Bearer ausente ou malformado" });
    }
    const senhaRecebida = authHeader.substring(7).trim();

    const { data: senhaEsperada, error: vaultError } = await supabase
      .rpc("get_vault_secret", { p_name: "FOP_INBOUND_TOKEN" });

    if (vaultError || !senhaEsperada) {
      console.error("[recebe-pedido] Falha ao ler senha do cofre", vaultError);
      return jsonResponse(500, { error: "Erro de configuração interna" });
    }

    if (senhaRecebida !== senhaEsperada) {
      console.warn("[recebe-pedido] Senha inválida");
      return jsonResponse(401, { error: "Senha inválida" });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corpo JSON malformado" });
    }

    // ── Branch: sincronização de catálogo de produtos ─────────────────────
    // Autenticação já validada acima via FOP_INBOUND_TOKEN
    if (body.tipo === "catalogo" && Array.isArray(body.produtos)) {
      const { error: upsertErr } = await (supabase as any)
        .from("sncf_produtos")
        .upsert(
          body.produtos.map((p: any) => ({
            sku:                  p.sku,
            ean:                  p.ean                 ?? null,
            nome_comercial:       p.nome_comercial,
            nome_completo:        p.nome_completo        ?? null,
            marca:                p.marca               ?? null,
            linha:                p.linha               ?? null,
            grupo:                p.grupo               ?? null,
            tipo:                 p.tipo                ?? null,
            colecao:              p.colecao             ?? null,
            cor_nome:             p.cor_nome            ?? null,
            tamanho_numero:       p.tamanho_numero      ?? null,
            descricao_produto:    p.descricao_produto   ?? null,
            tipo_embalagem:       p.tipo_embalagem      ?? null,
            material:             p.material            ?? null,
            material_descritivo:  p.material_descritivo ?? null,
            ncm:                  p.ncm                 ?? null,
            cest:                 p.cest                ?? null,
            origem_fisc:          p.origem_fisc         ?? null,
            origem_prod:          p.origem_prod         ?? null,
            preco_atacado:        p.preco_atacado,
            peso_g:               p.peso_g,
            multiplos:            p.multiplos,
            ativo:                p.ativo,
            altura_cm:            p.altura_cm           ?? null,
            largura_cm:           p.largura_cm          ?? null,
            profundidade_cm:      p.profundidade_cm     ?? null,
            atualizado_em:        new Date().toISOString(),
          })),
          { onConflict: "sku" }
        );
      if (upsertErr) {
        console.error("[recebe-pedido] upsert catálogo:", upsertErr);
        return jsonResponse(500, { error: upsertErr.message });
      }
      console.log(`[recebe-pedido] catálogo: ${body.produtos.length} produtos upsertados`);
      return jsonResponse(200, { ok: true, upsertados: body.produtos.length });
    }
    // ─────────────────────────────────────────────────────────────────────

    const obrigatorios = [
      "cnpj",
      "id_externo",
      "data_pedido",
      "valor_bruto",
      "valor_liquido",
      "condicao_solicitada",
      "forma_solicitada",
    ];
    const faltando = obrigatorios.filter((f) => body[f] === undefined || body[f] === null);
    if (faltando.length > 0) {
      return jsonResponse(400, {
        error: "Campos obrigatórios ausentes",
        campos_faltando: faltando,
      });
    }

    const { data, error } = await supabase.rpc("receber_pedido_externo", {
      // Originais (12)
      p_cnpj: body.cnpj,
      p_id_externo: body.id_externo,
      p_data_pedido: body.data_pedido,
      p_valor_bruto: body.valor_bruto,
      p_valor_liquido: body.valor_liquido,
      p_condicao_solicitada: body.condicao_solicitada,
      p_forma_solicitada: body.forma_solicitada,
      p_desconto_pct: body.desconto_pct ?? null,
      p_vendedor: body.vendedor ?? null,
      p_origem: body.origem ?? null,
      p_itens_json: body.itens_json ?? null,
      p_recebido_via: body.recebido_via ?? "api",
      // Novos: dados cadastrais do cliente (todos opcionais, repassados se vierem)
      p_razao_social: body.razao_social ?? null,
      p_nome_fantasia: body.nome_fantasia ?? null,
      p_inscricao_estadual: body.inscricao_estadual ?? null,
      p_isento_ie: body.isento_ie ?? null,
      p_situacao_cadastral: body.situacao_cadastral ?? null,
      p_cep: body.cep ?? null,
      p_logradouro: body.logradouro ?? null,
      p_numero: body.numero ?? null,
      p_complemento: body.complemento ?? null,
      p_bairro: body.bairro ?? null,
      p_cidade: body.cidade ?? null,
      p_uf: body.uf ?? null,
      p_telefone: body.telefone ?? null,
      p_email: body.email ?? null,
      p_endereco_entrega: body.endereco_entrega ?? null,
      p_contatos: body.contatos ?? null,
      p_segmento: body.segmento ?? null,
      p_regiao_atuacao: body.regiao_atuacao ?? null,
      p_canal_fop: body.canal_fop ?? null,
      p_tags: body.tags ?? null,
      p_observacao: body.observacao ?? null,
      p_premissas: body.premissas ?? null,
      p_observacao_pedido: body.observacao_pedido ?? null,
    });

    if (error) {
      const erroDoCliente = error.code === "22023";
      console.error("[recebe-pedido] Erro na RPC", {
        code: error.code,
        message: error.message,
        id_externo: body.id_externo,
      });
      return jsonResponse(erroDoCliente ? 400 : 500, {
        error: error.message,
        code: error.code,
      });
    }

    // Persiste frete e descontos (RPC não tem esses params — UPDATE direto pós-inserção)
    const valorFreteFinal      = Number(body.valor_frete ?? 0);
    const descontoCelebraValor = Number(body.desconto_celebra_valor ?? 0);
    const bonusPixValor        = Number(body.bonus_pix_valor        ?? 0);

    if (body.frete_tipo != null || valorFreteFinal > 0 || descontoCelebraValor > 0 || bonusPixValor > 0) {
      await supabase.from("pedidos").update({
        valor_frete:            valorFreteFinal,
        frete_tipo:             body.frete_tipo ?? null,
        ...(descontoCelebraValor > 0 ? { desconto_celebra_valor: descontoCelebraValor } : {}),
        ...(bonusPixValor        > 0 ? { bonus_pix_valor:        bonusPixValor        } : {}),
      }).eq("id", data.pedido_id);
    }

    console.log("[recebe-pedido] Sucesso", {
      id_externo: body.id_externo,
      pedido_id: data?.pedido_id,
      status: data?.status,
      estagio: data?.estagio_inicial,
    });

    return jsonResponse(200, data);
  } catch (e) {
    const err = e as Error;
    console.error("[recebe-pedido] Exceção não tratada", err);
    return jsonResponse(500, { error: "Erro interno: " + err.message });
  }
});
