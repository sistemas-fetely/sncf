// Edge function: analisar-credito-ia
// Análise consolidada de crédito pra Joseph decidir.
// Monta contexto rico (pedido + parceiro + KPIs + scores + histórico) e chama Claude Sonnet.
// Grava resultado em analises_credito.analise_ia_json.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o analista de crédito da Fetely, marca brasileira de descartáveis premium para celebrações (linha Lumier de velas e linha Célébrée de mesa). Analisa pedidos B2B de atacado.

PRINCÍPIOS FETELY (invioláveis):
1. Sistema sugere, humano decide — você NUNCA recusa automaticamente. Mesmo casos críticos viram "sugiro reprovar com motivo X".
2. Conservador na largada — cliente novo sem histórico = "aprovar com ressalva" ou "à vista".
3. Doutrina Petróleo — todo dado tem fonte; cite a fonte na justificativa (Serasa diz X, histórico interno mostra Y, etc.).
4. Tom humano, claro, sem corporativês. Português brasileiro.

OS 5 PERFIS DE CRÉDITO:
- novo_entrada: cliente novo, sem histórico, baixo risco aparente. Default R$ 5k, 30 dias, [boleto, pix, cartao].
- novo_qualificado: cliente novo com sinais positivos (Serasa limpo, capital adequado). Default R$ 10k, 60 dias, [boleto, pix, cartao].
- recorrente_bom_pagador: ≥3 análises aprovadas, atraso médio ≤5 dias, sem vencidos. Default R$ 25k, 90 dias, [boleto, pix, cartao].
- premium: cliente estratégico, sob negociação caso a caso. KA Parceiro/Família entram aqui.
- bandeira_vermelha: cliente flagged manualmente. Recomende reprovar ou somente à vista (pix/cartão), nunca prazo.

REGRAS DE PONDERAÇÃO:
- Bandeira vermelha ativa: alerta forte na justificativa, mas pondere razão e atualidade. Não é veto automático.
- Cooldown (reprovação <90 dias): pondere motivo anterior. Calote = reprovar de novo. "Valor alto sem histórico" + valor menor agora = à vista.
- Grupo econômico com vencidos: alerta visual, decisão humana fica contextual. Não bloqueie por isso sozinho.

CONFIANÇA (0-100):
- ≥85: caso claro, sinais coerentes (Serasa limpo + sem vencidos + valor compatível)
- 70-84: caso comum, sugestão padrão
- 50-69: caso complexo, sinais conflitantes — sinalize na justificativa
- <50: dados insuficientes — sugira devolver_analise pra mais info

DECISÃO SUGERIDA pode ser:
- aprovar: caminho feliz
- aprovar_com_ressalva: aprovação com condição limitada (motivo obrigatório)
- reprovar: motivo obrigatório
- devolver_analise: faltou anexo, contexto incompleto
- devolver_entrada: dado errado no payload (CNPJ não bate, valor inconsistente)

OUTPUT: JSON válido, sem markdown, sem texto fora do JSON.

REGRA: validade_ate é calculada pelo banco automaticamente (now() + 90 dias na aprovação). Sempre retorne null nesse campo.

ESTRUTURA OBRIGATÓRIA:
{
  "resumo": "3-5 linhas em prosa humana resumindo o caso",
  "pontos_atencao": ["item curto 1", "item curto 2"],
  "sugestao": {
    "perfil_aplicado": "novo_entrada"|"novo_qualificado"|"recorrente_bom_pagador"|"premium"|"bandeira_vermelha",
    "limite_concedido": number,
    "prazo_max_dias": int,
    "formas_aceitas": ["boleto","pix","cartao"],
    "parecer_final": "2-3 frases pro lojista (Joseph adapta antes de enviar)",
    "ressalva": string | null,
    "validade_ate": null
  },
  "decisao_sugerida": "aprovar"|"aprovar_com_ressalva"|"reprovar"|"devolver_analise"|"devolver_entrada",
  "justificativa": "1-2 parágrafos citando fontes específicas",
  "confianca": int  // 0-100
}`;

interface AnalisarRequest {
  analise_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const body = (await req.json()) as AnalisarRequest;
    const { analise_id } = body;

    if (!analise_id) {
      return new Response(
        JSON.stringify({ error: "analise_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1) Análise + pedido + parceiro
    const { data: analise, error: aErr } = await (supabase as any)
      .from("analises_credito")
      .select(`
        id, estagio_atual, status_final, perfil_aplicado, limite_concedido, prazo_max_dias,
        criado_em, analise_anterior_id,
        pedido:pedidos(id, id_externo, data_pedido, valor_bruto, valor_liquido, desconto_pct,
          condicao_solicitada, forma_solicitada, vendedor, origem, itens_json),
        parceiro:parceiros_comerciais(id, cnpj, razao_social, nome_fantasia, cep, logradouro,
          cidade, uf, telefone, email, cadastro_incompleto, bandeira_vermelha,
          bandeira_vermelha_motivo, bandeira_vermelha_em, grupo_economico_id, nivel_programa,
          categoria_ka, perfil_credito, contexto_bureau)
      `)
      .eq("id", analise_id)
      .single();

    if (aErr || !analise) {
      console.error("Erro buscando análise:", aErr, "analise:", analise);
      return new Response(
        JSON.stringify({ error: "Análise não encontrada", details: aErr?.message || aErr }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const parceiroId = analise.parceiro?.id;
    const grupoId = analise.parceiro?.grupo_economico_id;

    // 2) KPIs financeiros do cliente
    const { data: kpis } = await (supabase as any)
      .from("v_credito_resumo_financeiro")
      .select("*")
      .eq("parceiro_id", parceiroId)
      .single();

    // 3) KPIs do grupo (se houver)
    let kpisGrupo = null;
    if (grupoId) {
      const { data: kg } = await (supabase as any)
        .from("v_credito_resumo_financeiro_grupo")
        .select("*")
        .eq("grupo_economico_id", grupoId)
        .single();
      kpisGrupo = kg;
    }

    // 4) Sócios
    const { data: socios } = await (supabase as any)
      .from("socios_parceiro")
      .select("cpf_cnpj, nome, participacao_pct, qualificacao")
      .eq("parceiro_id", parceiroId)
      .is("desligado_em", null);

    // 5) Scores bureau desta análise
    const { data: scores } = await (supabase as any)
      .from("analise_credito_scores")
      .select("fonte, data_consulta, score_numerico, score_categorico, flag_pefin, flag_refin, flag_protestos, flag_falencia_rj, flag_acoes_judiciais, flag_cheque_devolvido, flag_divida_vencida, total_dividas")
      .eq("analise_id", analise_id);

    // 6) Análises anteriores deste parceiro
    const { data: anteriores } = await (supabase as any)
      .from("analises_credito")
      .select("id, status_final, perfil_aplicado, limite_concedido, prazo_max_dias, decidido_em, parecer_final")
      .eq("parceiro_id", parceiroId)
      .neq("id", analise_id)
      .not("status_final", "is", null)
      .order("decidido_em", { ascending: false })
      .limit(10);

    // 7) Cooldown — última análise reprovada <90 dias
    const cooldownAtivo = (anteriores || []).find((a: any) => {
      if (a.status_final !== "reprovado") return false;
      if (!a.decidido_em) return false;
      const dias = (Date.now() - new Date(a.decidido_em).getTime()) / 86400000;
      return dias < 90;
    });

    // Monta user prompt com contexto completo
    const userPrompt = `Analise esta análise de crédito.

PEDIDO:
- Valor bruto: R$ ${analise.pedido?.valor_bruto}
- Valor líquido: R$ ${analise.pedido?.valor_liquido} (desconto ${analise.pedido?.desconto_pct || 0}%)
- Condição solicitada: ${analise.pedido?.condicao_solicitada}
- Forma solicitada: ${analise.pedido?.forma_solicitada}
- Vendedor: ${analise.pedido?.vendedor || "—"}
- Origem: ${analise.pedido?.origem || "—"}

CLIENTE:
- CNPJ: ${analise.parceiro?.cnpj}
- Razão social: ${analise.parceiro?.razao_social}
- Nome fantasia: ${analise.parceiro?.nome_fantasia || "—"}
- Cidade/UF: ${analise.parceiro?.cidade || "—"}/${analise.parceiro?.uf || "—"}
- Cadastro completo: ${analise.parceiro?.cadastro_incompleto ? "NÃO" : "sim"}
- Sócios: ${JSON.stringify(socios || [])}
- Contexto bureau (histórico): ${JSON.stringify(analise.parceiro?.contexto_bureau || {})}

ESTADO ATUAL DO CLIENTE:
- Perfil de crédito atual: ${analise.parceiro?.perfil_credito}
- Nível de programa (silencioso): ${analise.parceiro?.nivel_programa}
- Categoria KA: ${analise.parceiro?.categoria_ka || "—"}
- Bandeira vermelha: ${analise.parceiro?.bandeira_vermelha ? `ATIVA — motivo: "${analise.parceiro?.bandeira_vermelha_motivo}"` : "não"}
- Cooldown ativo: ${cooldownAtivo ? `SIM — análise anterior reprovada em ${cooldownAtivo.decidido_em} com parecer: "${cooldownAtivo.parecer_final || "—"}"` : "não"}

KPIs FINANCEIROS DO CLIENTE:
${kpis ? `
- Em aberto: R$ ${kpis.em_aberto}
- Pago histórico: R$ ${kpis.pago}
- Vencidos: R$ ${kpis.vencidos}
- À vencer: R$ ${kpis.a_vencer}
- Maior compra: R$ ${kpis.maior_compra}
- Última compra em: ${kpis.ultima_compra_em || "—"}
- Atraso médio: ${Math.round(kpis.atraso_medio_dias || 0)} dias` : "Sem dados financeiros (cliente novo)"}

GRUPO ECONÔMICO:
${kpisGrupo ? `
- Nome: ${kpisGrupo.grupo_nome}
- Parceiros no grupo: ${kpisGrupo.qtd_parceiros}
- Em aberto grupo: R$ ${kpisGrupo.em_aberto}
- Vencidos grupo: R$ ${kpisGrupo.vencidos}
- Atraso médio grupo: ${Math.round(kpisGrupo.atraso_medio_dias || 0)} dias` : "Sem grupo econômico detectado"}

SCORES BUREAU ANEXADOS (extraídos por IA dos PDFs):
${(scores || []).length > 0 ? JSON.stringify(scores) : "Nenhum bureau anexado nesta análise"}

ANÁLISES ANTERIORES DESTE CLIENTE:
${(anteriores || []).length > 0 ? JSON.stringify(anteriores) : "Cliente novo na Fetely"}

Gere a análise estruturada em JSON conforme instruído no system prompt.`;

    // Chama Claude Sonnet via Lovable AI Gateway
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-20250514",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => "");
      console.error("Claude error:", aiResp.status, errorText);
      // Fallback: tenta Gemini Pro se Claude não tá disponível
      const fallbackResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!fallbackResp.ok) {
        return new Response(
          JSON.stringify({ error: `IA indisponível (Claude ${aiResp.status}, Gemini fallback ${fallbackResp.status})` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const fbData = await fallbackResp.json();
      return await processarRespostaIA(fbData, analise_id, supabase, corsHeaders, "gemini-pro-fallback");
    }

    const aiData = await aiResp.json();
    return await processarRespostaIA(aiData, analise_id, supabase, corsHeaders, "claude-sonnet-4");
  } catch (e) {
    console.error("analisar-credito-ia error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processarRespostaIA(
  aiData: any,
  analise_id: string,
  supabase: any,
  corsHeaders: Record<string, string>,
  modeloUsado: string
): Promise<Response> {
  let raw = aiData?.choices?.[0]?.message?.content ?? "";
  let jsonStr = String(raw).trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

  let analiseIA;
  try {
    analiseIA = JSON.parse(jsonStr);
  } catch (e) {
    console.error("Erro parsing JSON IA:", e, "raw:", raw);
    return new Response(
      JSON.stringify({ error: "IA retornou JSON inválido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Grava em analises_credito
  const { error: updErr } = await supabase
    .from("analises_credito")
    .update({
      analise_ia_json: { ...analiseIA, _modelo: modeloUsado },
      analise_ia_resumo: analiseIA.resumo,
      analise_ia_confianca: analiseIA.confianca,
      analise_ia_processada_em: new Date().toISOString(),
    })
    .eq("id", analise_id);

  if (updErr) {
    console.error("Erro gravando análise IA:", updErr);
    return new Response(
      JSON.stringify({ error: `Erro persistindo: ${updErr.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({
      analise_id,
      modelo: modeloUsado,
      analise_ia: analiseIA,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
