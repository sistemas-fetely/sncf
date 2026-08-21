import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { action, candidato_id, pdf_base64, vaga, candidato } = await req.json();

    // SECURITY: identifica o chamador quando autenticado. Recalcular score (ou pontuar
    // candidato inexistente) exige login; o portal público só faz o PRIMEIRO cálculo.
    const authHeader = req.headers.get("Authorization");
    let authedUserId: string | null = null;
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
        authedUserId = (claims?.claims?.sub as string | undefined) ?? null;
      } catch {
        authedUserId = null;
      }
    }

    // --- PARSE PDF ---
    if (action === "parse_pdf") {
      if (!pdf_base64) {
        return new Response(JSON.stringify({ error: "pdf_base64 obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: limite de tamanho para conter abuso de créditos de IA (~10MB de PDF)
      if (typeof pdf_base64 !== "string" || pdf_base64.length > 14_000_000) {
        return new Response(JSON.stringify({ error: "PDF muito grande (limite ~10MB)" }), {
          status: 413,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                "Você é um assistente que extrai dados estruturados de currículos em PDF. Responda APENAS com JSON válido, sem markdown.",
            },
            {
              role: "user",
              content: [
                {
                  type: "file",
                  file: {
                    filename: "curriculo.pdf",
                    file_data: `data:application/pdf;base64,${pdf_base64}`,
                  },
                },
                {
                  type: "text",
                  text: `Extraia as informações deste currículo e responda APENAS com JSON válido:
{
  "nome": "string ou null",
  "email": "string ou null",
  "telefone": "string ou null",
  "linkedin_url": "string ou null",
  "experiencias": [
    { "cargo": "string", "empresa": "string", "periodo_inicio": "MM/AAAA", "periodo_fim": "MM/AAAA ou null se atual", "atual": boolean, "descricao": "resumo breve das atividades" }
  ],
  "formacoes": [
    { "curso": "string", "instituicao": "string", "nivel": "tecnico|graduacao|pos|mba|mestrado|outro", "status": "concluido|cursando", "ano_conclusao": "AAAA ou null" }
  ],
  "skills_identificadas": ["string"]
}
Incluir as 3 experiências mais recentes e todas as formações. Skills técnicas identificadas no currículo.`,
                },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const status = response.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "Payment required" }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error("AI gateway error: " + status);
      }

      const data = await response.json();
      let texto = data.choices?.[0]?.message?.content ?? "";
      texto = texto.replace(/```json|```/g, "").trim();

      try {
        const perfil = JSON.parse(texto);
        return new Response(JSON.stringify({ perfil }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ perfil: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // --- CALCULAR SCORE ---
    if (action === "calcular_score") {
      if (!candidato_id || !vaga || !candidato) {
        return new Response(JSON.stringify({ error: "Dados incompletos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // SECURITY: sem login, só o PRIMEIRO cálculo é permitido (logo após a candidatura
      // pública, quando score_calculado_em ainda é NULL). Isso impede que qualquer
      // pessoa reescreva o score de um candidato existente via service role.
      if (!authedUserId) {
        const adminCheck = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        const { data: cand } = await adminCheck
          .from("candidatos")
          .select("score_calculado_em")
          .eq("id", candidato_id)
          .maybeSingle();
        if (!cand || cand.score_calculado_em) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                "Você é um especialista sênior em recrutamento. Calcule scores de aderência de candidatos. Responda APENAS com JSON válido, sem markdown.",
            },
            {
              role: "user",
              content: `Você é um especialista sênior em recrutamento. Avalie a aderência deste candidato à vaga com foco em FIT REAL — não apenas capacidade técnica.

═══ LÓGICA DE NÍVEL — REGRA PRINCIPAL ═══

DETECÇÃO DO NÍVEL REAL DO CANDIDATO:
Analise as experiências e defina o nível real:
- Jr: 0-2 anos, atividades de execução, pouca autonomia
- Pl: 2-5 anos, entrega independente, começa a liderar
- Sr: 5+ anos, referência técnica, lidera projetos
- Coordenacao: 7+ anos, gestão de times ou especialização profunda

REGRAS DE ADEQUAÇÃO DE NÍVEL (peso 30 pontos):
OVERQUALIFICATION É PENALIZAÇÃO, NÃO BÔNUS:
- Candidato Sr/Coord em vaga Jr: nivel_adequacao 5-12 pts. Risco ALTO de turnover. alerta: "overqualified"
- Candidato Sr em vaga Pl: nivel_adequacao 10-18 pts. Risco MÉDIO. alerta: "overqualified"
- Candidato Pl em vaga Jr: nivel_adequacao 12-20 pts. Risco MODERADO. alerta: "overqualified_leve"

FIT DE NÍVEL CORRETO:
- Candidato Jr em vaga Jr: nivel_adequacao 20-28 pts. alerta: null
- Candidato Pl em vaga Pl: nivel_adequacao 22-30 pts. alerta: null
- Candidato Sr em vaga Sr: nivel_adequacao 22-30 pts. alerta: null

UNDERQUALIFIED:
- Candidato Jr em vaga Pl: nivel_adequacao 8-15 pts. alerta: "underqualified"
- Candidato Jr em vaga Sr/Coord: nivel_adequacao 2-8 pts. alerta: "underqualified"

REGRAS DE SKILLS (peso 35 pontos):
- Avalie match entre skills do candidato e skills da vaga
- Equivalências: "Photoshop" = "Edição de imagem"; "React" = "Frontend"
- Skills desejadas são bônus, não penalize por não ter

REGRAS DE EXPERIÊNCIA (peso 20 pontos):
- Avalie relevância da experiência para a vaga específica
- Experiência em área diferente da vaga = menos pontos mesmo se for Sr

REGRAS DE MOTIVAÇÃO (peso 5 pontos):
O candidato responde "Por que a Fetely?" no formulário. Avalie a resposta com base no DNA da marca:
- A Fetely é uma marca de lifestyle com espírito comemorativo. Valoriza presença, cuidado, celebração do ordinário, estética no dia a dia.
- Tom da marca: questionador, humano, poético, atual. Frase síntese: "Gesto não se delega pro ChatGPT."
- Cultura interna: autogestão, maturidade, orgulho do que se constrói. Não é corporativismo — é gente que cuida.
Avalie:
- 5 pts: texto demonstra conexão genuína com o DNA — menciona celebração, presença, cuidado, estética ou propósito. Não é genérico.
- 3-4 pts: texto mostra interesse real mas sem conexão profunda com o DNA. Menciona a empresa de forma positiva mas poderia ser sobre qualquer marca.
- 1-2 pts: texto genérico, copiado de template, ou focado apenas em salário/benefício.
- 0 pts: campo vazio ou não respondido.
O campo "motivacao_texto" deve trazer uma avaliação em 1 frase explicando a nota.

REGRAS DE PRETENSÃO SALARIAL (ajuste no total, peso até -15 pontos):
- Se pretensão não informada: ignorar, não penalizar nem bonificar.
- Se pretensão dentro da faixa da vaga (entre faixa_min e faixa_max): nenhum ajuste.
- Se pretensão até 20% acima da faixa_max: subtrair 5 pontos do total. alerta_salarial: "acima_leve"
- Se pretensão mais de 20% acima da faixa_max: subtrair 10-15 pontos do total. alerta_salarial: "acima_critico"
- Se pretensão abaixo da faixa_min: não penalizar, mas registrar alerta_salarial: "abaixo" (pode indicar underqualification ou desespero).

═══ DADOS DA AVALIAÇÃO ═══

VAGA:
- Título: ${vaga.titulo}
- Nível exigido: ${vaga.nivel}
- Skills obrigatórias: ${JSON.stringify(vaga.skills_obrigatorias)}
- Skills desejadas: ${JSON.stringify(vaga.skills_desejadas)}
- Ferramentas: ${JSON.stringify(vaga.ferramentas)}
- Faixa salarial da vaga: R$ ${vaga.faixa_min ?? "não informada"} – R$ ${vaga.faixa_max ?? "não informada"}

CANDIDATO:
- Skills declaradas: ${JSON.stringify(candidato.skills_candidato)}
- Sistemas declarados: ${JSON.stringify(candidato.sistemas_candidato)}
- Experiências: ${JSON.stringify(candidato.experiencias)}
- Formações: ${JSON.stringify(candidato.formacoes)}
- Motivação: "${candidato.mensagem || ""}"
- Pretensão salarial: R$ ${candidato.pretensao_salarial ?? "não informada"}

═══ CALIBRAÇÃO ═══
- Candidato Jr bom em vaga Jr → 65-78
- Candidato Pl em vaga Pl → 70-85
- Candidato Sr em vaga Sr → 75-90
- Candidato Pl em vaga Jr (overqualified leve) → 45-60
- Candidato Sr em vaga Jr (overqualified) → 25-40
- Candidato Jr em vaga Sr (underqualified) → 10-28

REGRA DO RESUMO — OBRIGATÓRIA:
O campo "resumo" é o que o recrutador lê para decidir. Seja direto e útil. Formato obrigatório em 3 partes:
1. "Nível detectado: [X] → Vaga: [Y]" — sempre começar assim.
2. Principal gap (se negativo) ou principal força (se positivo) — 1 frase.
3. Recomendação final: "Recomendação: Avançar" ou "Recomendação: Avaliar com cautela" ou "Recomendação: Não recomendado". Sempre terminar com uma dessas 3 opções.
Exemplo bom: "Nível detectado: Sr → Vaga: Jr. Candidato com 8 anos de experiência em gestão comercial, muito acima do escopo da vaga. Recomendação: Não recomendado."
Exemplo bom: "Nível detectado: Jr → Vaga: Jr. Skills básicas corretas, falta experiência prática mas formação sólida. Recomendação: Avançar."

Responda APENAS com JSON válido:
{
  "skills_match": 0-35,
  "nivel_adequacao": 0-30,
  "experiencia_relevante": 0-20,
  "sistemas_match": 0-10,
  "motivacao": 0-5,
  "total": 0-100,
  "nivel_detectado": "jr|pl|sr|coordenacao|especialista",
  "alerta": "overqualified|overqualified_leve|underqualified|null",
  "alerta_texto": "string explicando o risco em 1 linha, ou null se não há alerta",
  "alerta_salarial": "acima_leve|acima_critico|abaixo|null",
  "resumo": "3 linhas: (1) nível detectado vs nível da vaga, (2) principal gap ou principal força, (3) recomendação clara: Avançar / Avaliar com cautela / Não recomendado",
  "motivacao_texto": "string com avaliação em 1 frase da motivação, ou null se campo vazio"
}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error("AI gateway error:", response.status);
        return new Response(JSON.stringify({ error: "Erro ao calcular score" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      let texto = data.choices?.[0]?.message?.content ?? "";
      texto = texto.replace(/```json|```/g, "").trim();

      try {
        const score = JSON.parse(texto);

        // Update candidato in database
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

        await supabaseAdmin
          .from("candidatos")
          .update({
            score_total: score.total,
            score_detalhado: score,
            score_calculado_em: new Date().toISOString(),
          })
          .eq("id", candidato_id);

        return new Response(JSON.stringify({ score }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ error: "Erro ao parsear score" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "action inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("score-candidato error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});