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
    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonResponse(400, { error: "Corpo JSON malformado" });
    }

    // ── Branch pull-catalogo (chamado pelo cron sync-catalogo-diario) ──
    if (body?.tipo === "pull-catalogo") {
      const supabasePull = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: fopKey } = await supabasePull.rpc("get_vault_secret", {
        p_name: "FOP_SERVICE_ROLE_KEY",
      });
      if (!fopKey) {
        return new Response(
          JSON.stringify({ error: "FOP_SERVICE_ROLE_KEY não configurado no vault" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      const FOP_URL = "https://onalegxugtuxpfhonayq.supabase.co";
      const resp = await fetch(
        `${FOP_URL}/rest/v1/products?select=sku,nome_comercial,preco_atacado,peso_g,multiplos,ativo&ativo=eq.true&limit=2000`,
        { headers: { apikey: fopKey, Authorization: `Bearer ${fopKey}` } }
      );
      if (!resp.ok) {
        const err = await resp.text();
        return new Response(
          JSON.stringify({ error: `FOP respondeu ${resp.status}: ${err}` }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        );
      }

      const produtos = await resp.json() as Array<{
        sku: string; nome_comercial: string; preco_atacado: number;
        peso_g: number; multiplos: number; ativo: boolean;
      }>;

      if (!produtos || produtos.length === 0) {
        return new Response(
          JSON.stringify({ ok: true, upsertados: 0, mensagem: "Nenhum produto ativo" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      const LOTE = 500;
      let total = 0;
      for (let i = 0; i < produtos.length; i += LOTE) {
        const lote = produtos.slice(i, i + LOTE);
        const { error } = await (supabasePull as any)
          .from("sncf_produtos")
          .upsert(
            lote.map((p) => ({
              sku:            p.sku,
              nome_comercial: p.nome_comercial,
              preco_atacado:  p.preco_atacado,
              peso_g:         p.peso_g,
              multiplos:      p.multiplos,
              ativo:          p.ativo,
              atualizado_em:  new Date().toISOString(),
            })),
            { onConflict: "sku" }
          );
        if (error) throw error;
        total += lote.length;
      }

      return new Response(
        JSON.stringify({ ok: true, upsertados: total, mensagem: `${total} produtos sincronizados` }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    // ── fim branch pull-catalogo ──

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

    // ── Branch: leitura do Farol de Pedidos (chamado pelo FOP) ──
    // Autenticação já validada acima via FOP_INBOUND_TOKEN
    if (body.tipo === "farol") {
      const { data: pedidos, error: errPedidos } = await supabase
        .from("vw_pedidos_farol")
        .select("*");
      if (errPedidos) {
        console.error("[recebe-pedido] farol: erro lendo vw_pedidos_farol", errPedidos);
        return jsonResponse(500, { error: errPedidos.message });
      }

      const { data: regua, error: errRegua } = await supabase
        .from("sla_fase_pedido")
        .select("estagio, ordem, tipo_sla, sla_dias")
        .eq("ativo", true)
        .order("ordem", { ascending: true });
      if (errRegua) {
        console.error("[recebe-pedido] farol: erro lendo sla_fase_pedido", errRegua);
        return jsonResponse(500, { error: errRegua.message });
      }

      console.log(`[recebe-pedido] farol: ${pedidos?.length ?? 0} pedidos, ${regua?.length ?? 0} fases`);
      return jsonResponse(200, { pedidos: pedidos ?? [], regua: regua ?? [] });
    }
// ── fim branch farol ──

// ── Branch: leitura do Farol B2C (chamado pelo FOP) ──
// Autenticação já validada acima via FOP_INBOUND_TOKEN
if (body.tipo === "farol_b2c") {
  const { data: pedidosB2c, error: errB2c } = await supabase
    .from("vw_gestao_b2c")
    .select("*")
    .neq("estagio_derivado", "cancelado");

  if (errB2c) {
    console.error("[recebe-pedido] farol_b2c: erro lendo vw_gestao_b2c", errB2c);
    return jsonResponse(500, { error: errB2c.message });
  }

  console.log(`[recebe-pedido] farol_b2c: ${pedidosB2c?.length ?? 0} pedidos`);
  return jsonResponse(200, { pedidos: pedidosB2c ?? [] });
}
// ── fim branch farol_b2c ──

// ── Branch: canal_criar — nova mensagem do comercial (FOP → SNCF) ──
if (body.tipo === "canal_criar") {
  const sncfPedidoId = body?.sncf_pedido_id as string | undefined;
  const texto = body?.texto as string | undefined;
  const autorNome = body?.autor_nome as string | undefined;

  if (!sncfPedidoId || !texto?.trim()) {
    return jsonResponse(400, { error: "sncf_pedido_id e texto são obrigatórios" });
  }

  const { data: resultado, error: errEvento } = await (supabase as any)
    .rpc("registrar_evento_pedido", {
      p_pedido_id: sncfPedidoId,
      p_tipo_evento: "msg_comercial",
      p_descricao: texto.trim(),
      p_metadata: autorNome ? { autor_nome: autorNome } : null,
    });

  if (errEvento) {
    console.error("[recebe-pedido] canal_criar: erro ao registrar evento", errEvento);
    return jsonResponse(500, { error: "Erro ao registrar mensagem" });
  }

  return jsonResponse(200, { ok: true, evento_id: (resultado as any)?.evento_id ?? null });
}
// ── fim branch canal_criar ──

// ── Branch: canal_listar — listar msgs + marcar lidas pelo FOP ──
if (body.tipo === "canal_listar") {
  const sncfPedidoId = body?.sncf_pedido_id as string | undefined;
  if (!sncfPedidoId) {
    return jsonResponse(400, { error: "sncf_pedido_id é obrigatório" });
  }

  const { data: eventos, error: errEventos } = await (supabase as any)
    .from("pedido_eventos")
    .select("id, tipo_evento, descricao, metadata, operador_id, criado_em, lida_fop")
    .eq("pedido_id", sncfPedidoId)
    .in("tipo_evento", ["msg_comercial", "msg_sops"])
    .order("criado_em", { ascending: true });

  if (errEventos) {
    console.error("[recebe-pedido] canal_listar: erro ao listar eventos", errEventos);
    return jsonResponse(500, { error: "Erro ao listar mensagens" });
  }

  const { error: errMarcaLida } = await (supabase as any)
    .from("pedido_eventos")
    .update({ lida_fop: true })
    .eq("pedido_id", sncfPedidoId)
    .eq("tipo_evento", "msg_sops")
    .eq("lida_fop", false);

  if (errMarcaLida) {
    console.error("[recebe-pedido] canal_listar: erro ao marcar lidas", errMarcaLida);
  }

  return jsonResponse(200, { ok: true, eventos: eventos ?? [] });
}
// ── fim branch canal_listar ──

// ── Branch: canal_badges — contagem de msg_sops não lidas por pedido ──
if (body.tipo === "canal_badges") {
  const { data: naoLidas, error: errBadges } = await (supabase as any)
    .from("pedido_eventos")
    .select("pedido_id")
    .eq("tipo_evento", "msg_sops")
    .eq("lida_fop", false);

  if (errBadges) {
    console.error("[recebe-pedido] canal_badges: erro ao buscar badges", errBadges);
    return jsonResponse(500, { error: "Erro ao buscar badges" });
  }

  const badges: Record<string, number> = {};
  for (const row of ((naoLidas ?? []) as any[])) {
    const pid = row.pedido_id as string;
    badges[pid] = (badges[pid] ?? 0) + 1;
  }

  return jsonResponse(200, { ok: true, badges });
}
// ── fim branch canal_badges ──

// ── Branch: ficha_pendencias — portão de publicação do cadastro no FOP ──
// Autenticação já validada acima via FOP_INBOUND_TOKEN
if (body.tipo === "ficha_pendencias") {
  const skus = Array.isArray(body.skus)
    ? body.skus.map((s: unknown) => String(s).trim()).filter(Boolean)
    : [];

  let q = (supabase as any)
    .from("vw_produto_ficha_pendencias")
    .select("sku, cod_cadastro, colecao, nome_comercial, campo, bloco, dono");
  if (skus.length > 0) q = q.in("sku", skus);

  const { data: pendencias, error: errPend } = await q;
  if (errPend) {
    console.error("[recebe-pedido] ficha_pendencias: erro na query", errPend);
    return jsonResponse(500, { error: errPend.message });
  }

  return jsonResponse(200, { ok: true, pendencias: pendencias ?? [] });
}
// ── fim branch ficha_pendencias ──




    // ── Branch: sincronização de catálogo de produtos ─────────────────────
    // Autenticação já validada acima via FOP_INBOUND_TOKEN
    if (body.tipo === "catalogo" && Array.isArray(body.produtos)) {
      const { error: upsertErr } = await (supabase as any)
        .from("sncf_produtos")
        .upsert(
          body.produtos.map((p: any) => ({
            sku:                  p.sku,
            // Chave canônica (mapa-donos-catalogo-v1). CONDICIONAL de propósito: se o FOP ainda não
            // enviar o campo, a chave NÃO entra no upsert e o valor já gravado no banco sobrevive.
            // Nunca trocar por `cod_cadastro: p.cod_cadastro ?? null` — isso apagaria o backfill
            // a cada sync (mesmo padrão do fire-and-erase do sync-produtos, corrigido em 08/08).
            ...(typeof p.cod_cadastro === "string" && p.cod_cadastro.length > 0
              ? { cod_cadastro: p.cod_cadastro.trim() }
              : {}),
            // Fase do ciclo de vida (mapa-donos-catalogo-v1 v4). CONDICIONAL pelo mesmo motivo do
            // cod_cadastro: se o FOP não enviar, a chave não entra no upsert e o backfill sobrevive.
            ...(typeof p.fase === "string" && p.fase.length > 0
              ? { fase: p.fase.trim() }
              : {}),
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
            preco_varejo:         p.preco_varejo        ?? null,
            peso_g:               p.peso_g,
            multiplos:            p.multiplos,
            ativo:                p.ativo,
            altura_cm:            p.altura_cm           ?? null,
            largura_cm:           p.largura_cm          ?? null,
            profundidade_cm:      p.profundidade_cm     ?? null,
            // cor e estampa sao os atributos DISCRIMINANTES do produto. Alimentam
            // fn_gerar_nome_operacional(), que monta o nome_operacional usado pela separacao
            // (vw_xpm_cad_item) e pela NF. Sem eles, SKUs de nome comercial identico voltam
            // a ser indistinguiveis para quem separa (causa do PED-2122). Nao remover.
            cor:                  p.cor                 ?? null,
            estampa:              p.estampa             ?? null,
            atualizado_em:        new Date().toISOString(),
          })),
          { onConflict: "sku" }
        );
      if (upsertErr) {
        console.error("[recebe-pedido] upsert catálogo:", upsertErr);
        return jsonResponse(500, { error: upsertErr.message });
      }

      // OPERACIONAL-DERIVA-DO-COMERCIAL: nome_operacional nunca e digitado, e sempre
      // derivado de grupo/tipo/colecao/tamanho + o discriminante declarado por colecao
      // em colecao_regra_nome. Regerar aqui garante que catalogo novo ja nasce correto.
      const skusLote: string[] = body.produtos
        .map((p: any) => p.sku)
        .filter((s: any) => typeof s === "string" && s.length > 0);
      if (skusLote.length > 0) {
        const { error: nomeErr } = await (supabase as any).rpc("regerar_nome_operacional", {
          p_skus: skusLote,
        });
        if (nomeErr) {
          console.error("[recebe-pedido] regerar_nome_operacional:", nomeErr);
          return jsonResponse(500, {
            error: `Falha ao regerar nome_operacional: ${nomeErr.message}`,
            details: nomeErr.details ?? null,
            hint: nomeErr.hint ?? null,
          });
        }
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

    // Normaliza itens_json: FOP envia preco_unitario; canônico interno do SNCF é valor_unitario.
    // Garante que valor_unitario sempre exista, preservando preco_unitario para compatibilidade.
    if (Array.isArray(body.itens_json)) {
      body.itens_json = body.itens_json.map((it: any) => ({
        ...it,
        valor_unitario: it.valor_unitario ?? it.preco_unitario ?? null,
      }));
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
      p_observacao_cliente: body.observacao_cliente ?? null,
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

    const veioAcrescimoIE =
      body.acrescimo_ie_valor !== undefined || body.acrescimo_ie_aplicado !== undefined;
    const acrescimoIeValor = Number(body.acrescimo_ie_valor ?? 0);
    const acrescimoIePct = body.acrescimo_ie_pct != null ? Number(body.acrescimo_ie_pct) : null;
    const acrescimoIeOrigem = acrescimoIeValor > 0 ? "fop_declarado" : null;

    if (body.frete_tipo != null || valorFreteFinal > 0 || descontoCelebraValor > 0 || bonusPixValor > 0) {
      await supabase.from("pedidos").update({
        valor_frete:            valorFreteFinal,
        frete_tipo:             body.frete_tipo ?? null,
        ...(descontoCelebraValor > 0 ? { desconto_celebra_valor: descontoCelebraValor } : {}),
        ...(bonusPixValor        > 0 ? { bonus_pix_valor:        bonusPixValor        } : {}),
      }).eq("id", data.pedido_id);
    }

    await supabase.from("pedidos").update({
      ...(veioAcrescimoIE ? {
        acrescimo_ie_valor:  acrescimoIeValor,
        acrescimo_ie_pct:    acrescimoIePct,
        acrescimo_ie_origem: acrescimoIeOrigem,
      } : {}),
      snapshot_original: {
        valor_bruto:             body.valor_bruto,
        valor_liquido:           body.valor_liquido,
        valor_frete:             valorFreteFinal,
        frete_tipo:              body.frete_tipo ?? null,
        desconto_celebra_valor:  descontoCelebraValor,
        bonus_pix_valor:         bonusPixValor,
        itens_json:              body.itens_json ?? null,
        gravado_em:              new Date().toISOString(),
        acrescimo_ie_valor:    veioAcrescimoIE ? acrescimoIeValor : null,
        acrescimo_ie_pct:      veioAcrescimoIE ? acrescimoIePct : null,
        acrescimo_ie_aplicado: veioAcrescimoIE ? body.acrescimo_ie_aplicado === true : null,
      },
    }).eq("id", data.pedido_id);

    // Resolve vendedor pós-inserção (RPC não pode ser alterada — função separada no banco)
    let vendedorResolvido: string | null = null;
    try {
      const { data: vendedorData, error: vendedorError } = await supabase.rpc(
        "resolver_vendedor_pedido",
        {
          p_pedido_id: data.pedido_id,
          p_fop_profile_id: body.vendedor_id ?? null,
          p_vendedor_nome: body.vendedor ?? null,
          p_vendedor_email: body.vendedor_email ?? null,
          p_vendedor_tipo: body.vendedor_tipo ?? null,
        }
      );

      if (vendedorError) {
        console.error("[recebe-pedido] Falha ao resolver vendedor", {
          pedido_id: data.pedido_id,
          id_externo: body.id_externo,
          error: vendedorError.message,
        });
      } else if (vendedorData === null) {
        console.warn("[recebe-pedido] Vendedor nao resolvido", {
          id_externo: body.id_externo,
          vendedor: body.vendedor,
        });
      } else {
        vendedorResolvido = vendedorData as string;
      }
    } catch (vendedorErr) {
      console.error("[recebe-pedido] Falha ao resolver vendedor", {
        pedido_id: data.pedido_id,
        id_externo: body.id_externo,
        error: (vendedorErr as Error).message,
      });
    }

    console.log("[recebe-pedido] Sucesso", {
      id_externo: body.id_externo,
      pedido_id: data?.pedido_id,
      status: data?.status,
      estagio: data?.estagio_inicial,
      vendedor_resolvido: vendedorResolvido,
    });

    return jsonResponse(200, data);
  } catch (e) {
    const err = e as Error;
    console.error("[recebe-pedido] Exceção não tratada", err);
    return jsonResponse(500, { error: "Erro interno: " + err.message });
  }
});
