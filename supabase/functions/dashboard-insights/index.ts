// Edge function: gera insights de RH baseados em dados reais do dashboard.
// Usa Lovable AI Gateway com Google Search habilitado para buscar notícias relevantes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DashboardData {
  onboardingsAtrasados: number;
  contratosVencendo: number;
  tarefasBloqueantes: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Require authenticated request to prevent AI credit abuse
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = (await req.json()) as DashboardData;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurada");

    const prompt = `Você é o assistente inteligente do Fetély, sistema de RH da Fetely — uma empresa brasileira de artigos de festa, papelaria e decoração com espírito comemorativo.

DADOS ATUAIS DO SISTEMA:
- ${data.onboardingsAtrasados} tarefas de onboarding atrasadas
- ${data.contratosVencendo} contratos PJ vencendo nos próximos 30 dias
- ${data.tarefasBloqueantes} tarefas legais bloqueantes atrasadas

Use a ferramenta de busca para encontrar UMA notícia recente e relevante sobre RH no Brasil (eSocial, legislação trabalhista, gestão de pessoas, tendências). Depois retorne APENAS um JSON válido (sem markdown, sem backticks, sem texto antes ou depois) com EXATAMENTE esta estrutura:

{
  "analise": "Análise curta (2-3 frases) do momento atual do RH baseada nos dados acima. Seja direto e actionable.",
  "prioridade_do_dia": "A ação mais importante que o RH deve fazer hoje, baseada nos dados.",
  "dica_produtividade": "Uma dica prática e específica de gestão de pessoas. Não genérica — relacionada ao contexto.",
  "noticia": {
    "titulo": "Título da notícia encontrada na busca",
    "resumo": "Resumo em 2 frases da notícia e por que é relevante para o RH da Fetely",
    "fonte": "Nome da fonte (ex: Valor Econômico, Folha, Gov.br)",
    "url": "URL da matéria original"
  }
}

Inclua a URL da matéria original no campo url. Se não encontrar a URL exata, deixe vazio ("").`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um analista de RH sênior. Use busca na web para fundamentar a notícia. Responda APENAS com JSON válido, sem qualquer texto adicional ou formatação markdown.",
          },
          { role: "user", content: prompt },
        ],
        tools: [{ type: "google_search" }],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos em Settings → Workspace → Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const txt = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, txt);
      return new Response(JSON.stringify({ error: "Falha no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const raw = aiData?.choices?.[0]?.message?.content ?? "";

    // Extrai JSON robustamente — modelo pode envolver em ```json ... ```
    let jsonStr = String(raw).trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    let insights;
    try {
      insights = JSON.parse(jsonStr);
    } catch (e) {
      console.error("JSON parse error. Raw content:", raw);
      return new Response(
        JSON.stringify({ error: "Resposta da IA inválida. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
