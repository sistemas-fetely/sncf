import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { pasta_id } = await req.json();
    if (!pasta_id) {
      return new Response(JSON.stringify({ error: "pasta_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca pasta
    const { data: pasta, error: errP } = await supabase
      .from("ged_pastas")
      .select("*, parceiros_comerciais(razao_social, cnpj)")
      .eq("id", pasta_id)
      .single();

    if (errP || !pasta) {
      return new Response(JSON.stringify({ error: "Pasta não encontrada" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Busca documentos relevantes da pasta
    const { data: documentos } = await supabase
      .from("ged_documentos")
      .select("id, nome, tipo_documento, resumo_ia, classificacao_ia, created_at")
      .eq("pasta_id", pasta_id)
      .in("tipo_documento", ["contrato", "orcamento", "proposta", "aditivo"])
      .order("created_at", { ascending: true });

    if (!documentos || documentos.length === 0) {
      return new Response(JSON.stringify({
        error: "Nenhum documento contratual encontrado na pasta. Adicione contratos, orçamentos ou propostas.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Monta contexto agregado
    const contexto = documentos.map((d, i) => {
      const cls = d.classificacao_ia as Record<string, unknown> | null;
      const partes = [
        `[Documento ${i + 1}] ${d.nome}`,
        `Tipo: ${d.tipo_documento}`,
        `Adicionado em: ${new Date(d.created_at).toLocaleDateString("pt-BR")}`,
      ];
      if (cls?.data_emissao) partes.push(`Data emissão: ${cls.data_emissao}`);
      if (cls?.data_validade) partes.push(`Validade: ${cls.data_validade}`);
      if (cls?.valor) partes.push(`Valor: R$ ${cls.valor}`);
      if (cls?.numero_documento) partes.push(`Número: ${cls.numero_documento}`);
      if (d.resumo_ia) partes.push(`Resumo: ${d.resumo_ia}`);
      if (Array.isArray(cls?.pontos_principais)) {
        partes.push(`Pontos principais:\n${(cls.pontos_principais as string[]).map(p => `- ${p}`).join("\n")}`);
      }
      return partes.join("\n");
    }).join("\n\n---\n\n");

    const parceiroNome = (pasta.parceiros_comerciais as any)?.razao_social ?? "Parceiro";

    const systemPrompt = `Você é um especialista em análise contratual. Analise os documentos abaixo de um mesmo projeto/relacionamento e extraia os dados estruturados do contrato vigente.

PROJETO: ${pasta.nome}
PARCEIRO: ${parceiroNome}
TIPO: ${pasta.tipo}

DOCUMENTOS DA PASTA (em ordem cronológica):

${contexto}

Sua tarefa: identificar qual contrato está VIGENTE (mais recente válido) e quais propostas/orçamentos estão atrelados a ele. Documentos vencidos (validade passada) devem ser sinalizados mas não usados como base.

Responda APENAS com JSON neste formato (sem markdown):

{
  "numero_sugerido": string (ex: "CTR-ABCASA-2026"),
  "data_assinatura": string YYYY-MM-DD ou null,
  "vigencia_inicio": string YYYY-MM-DD,
  "vigencia_fim": string YYYY-MM-DD ou null,
  "valor_total": number,
  "valor_parcela": number,
  "ciclo_pagamento": "unico" | "parcelado" | "mensal" | "trimestral" | "anual",
  "numero_parcelas": number ou null (só para parcelado),
  "dia_vencimento": number 1-28 ou null,
  "data_primeira_parcela": string YYYY-MM-DD,
  "tem_setup": boolean,
  "valor_setup": number ou null,
  "parcelas_setup": number ou null,
  "reajuste_indice": "nenhum" | "igpm" | "ipca" | "prefixado",
  "reajuste_data": string YYYY-MM-DD ou null,
  "renova_automaticamente": boolean,
  "permite_valor_variavel": boolean (true para SaaS com cobrança variável),
  "resumo_ia": string (2-3 linhas com a história consolidada do contrato),
  "documentos_usados": array de strings (ids dos documentos que deram base, na ordem [{${documentos.map(d => `"${d.id}"`).join(", ")}}]),
  "documentos_vencidos": array de strings (ids de docs vencidos/superados),
  "confianca": "alta" | "baixa"
}

REGRAS:
- Se houver propostas vencidas e uma mais recente, use a mais recente
- Se há contrato assinado, ele PREVALECE sobre orçamentos
- Para SaaS (Anthropic, Lovable, etc): permite_valor_variavel = true
- valor_total: total comprometido. Para mensal sem fim, use valor_parcela * 12 como estimativa anual
- Datas em formato brasileiro (R$ 4.542,79 = 4542.79; 5 parcelas de R$ 4.542,79)
- Se faltar informação crítica, marque confianca = "baixa" mas faça melhor estimativa possível`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: systemPrompt }],
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Erro AI Gateway:", errText);
      return new Response(JSON.stringify({ error: "Erro ao processar com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content ?? "";

    let parsed: Record<string, unknown>;
    try {
      const clean = content.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      console.error("Erro ao parsear JSON da IA:", content);
      return new Response(JSON.stringify({ error: "IA retornou formato inválido", raw: content }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Erro geral:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
