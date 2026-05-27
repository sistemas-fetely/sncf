// Edge function: parse-bureau-pdf
// Extrai dados estruturados de PDFs de bureau (Serasa Experian ou Boa Vista).
// Usa Gemini 2.5 Flash via Lovable AI Gateway.
// Detecta fonte automaticamente pelos marcadores no PDF.
// Grava resultado em analise_credito_scores.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um extrator de dados de relatórios de bureau de crédito (Serasa Experian e Boa Vista SCPC).

DETECTE A FONTE automaticamente:
- Se o PDF mencionar "Serasa Experian", "Serasa Score Empresas", "RELATÓRIO RELATO" → fonte = "serasa"
- Se mencionar "Boa Vista", "BVG", "Empresarial Gold" → fonte = "bvg"

REGRAS DE EXTRAÇÃO:
- Quando flag aparecer como "Sem registros" ou "Nada consta" → false
- Quando flag aparecer com registros (PEFIN: 3 registros, etc.) → true
- Quando campo não constar no PDF → null
- Score numérico: só Serasa tem (0-1000). BVG sempre null.
- CNPJ: extrair apenas dígitos (sem pontos, traços, barras)
- Datas: formato ISO YYYY-MM-DD

OUTPUT: JSON válido, sem markdown, sem texto fora do JSON.

ESTRUTURA OBRIGATÓRIA:
{
  "fonte": "serasa" | "bvg",
  "cnpj_consultado": "string só dígitos",
  "data_consulta": "YYYY-MM-DD" | null,
  
  "score_numerico": int | null,
  "score_categorico": string | null,
  "probabilidade_inadimplencia_pct": number | null,
  
  "flag_pefin": boolean | null,
  "flag_refin": boolean | null,
  "flag_protestos": boolean | null,
  "flag_falencia_rj": boolean | null,
  "flag_acoes_judiciais": boolean | null,
  "flag_cheque_devolvido": boolean | null,
  "flag_divida_vencida": boolean | null,
  
  "total_dividas": number | null,
  
  "situacao_cadastral": "ATIVA" | "SUSPENSA" | "INAPTA" | null,
  "data_fundacao": "YYYY-MM-DD" | null,
  "capital_social": number | null,
  
  "socios": [
    {
      "cpf_cnpj": "string",
      "nome": "string",
      "participacao_pct": number | null,
      "qualificacao": "string" | null,
      "data_entrada": "YYYY-MM-DD" | null
    }
  ],
  
  "atraso_medio_dias": number | null,
  
  "principais_fornecedores": [
    { "cnpj": "string", "razao_social": "string" }
  ],
  
  "tempo_mercado_anos": number | null,
  
  "extracao_confianca": int  // 0-100, sua confiança na extração
}`;

interface ParseBureauRequest {
  analise_id: string;
  documento_storage_path: string;  // path no bucket ged
  bucket?: string;  // default 'ged'
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

    const body = (await req.json()) as ParseBureauRequest;
    const { analise_id, documento_storage_path, bucket = "ged" } = body;

    if (!analise_id || !documento_storage_path) {
      return new Response(
        JSON.stringify({ error: "analise_id e documento_storage_path são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Busca dados da análise pra validação cruzada
    const { data: analiseData, error: analiseErr } = await (supabase as any)
      .from("analises_credito")
      .select("id, parceiro_id, parceiros_comerciais(cnpj)")
      .eq("id", analise_id)
      .single();
    
    if (analiseErr || !analiseData) {
      return new Response(
        JSON.stringify({ error: "Análise não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cnpjEsperado = (analiseData as any).parceiros_comerciais?.cnpj as string;
    const parceiroId = analiseData.parceiro_id;

    // Baixa PDF do storage
    const { data: pdfData, error: pdfErr } = await supabase.storage
      .from(bucket)
      .download(documento_storage_path);

    if (pdfErr || !pdfData) {
      return new Response(
        JSON.stringify({ error: `Erro baixando PDF: ${pdfErr?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Converte pra base64 (chunked pra não estourar stack em PDFs grandes)
    const arrayBuffer = await pdfData.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    // Chama Gemini via Lovable AI Gateway
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
              {
                type: "text",
                text: `Extraia os dados deste PDF. CNPJ esperado: ${cnpjEsperado || "desconhecido"}`,
              },
            ],
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errorText = await aiResp.text().catch(() => "");
      console.error("Gemini error:", aiResp.status, errorText);
      return new Response(
        JSON.stringify({ error: `IA indisponível (${aiResp.status})` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResp.json();
    let raw = aiData?.choices?.[0]?.message?.content ?? "";
    let jsonStr = String(raw).trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);

    let extraido;
    try {
      extraido = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro parsing JSON:", e, "raw:", raw);
      return new Response(
        JSON.stringify({ error: "IA retornou JSON inválido" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validação cruzada CNPJ
    const cnpjExtraido = String(extraido.cnpj_consultado || "").replace(/\D/g, "");
    const cnpjLimpo = (cnpjEsperado || "").replace(/\D/g, "");
    const cnpjMatch = cnpjExtraido && cnpjLimpo && cnpjExtraido === cnpjLimpo;

    // Grava em analise_credito_scores (SECURITY DEFINER respeitado via authenticated)
    const { data: scoreInserido, error: scoreErr } = await (supabase as any)
      .from("analise_credito_scores")
      .insert({
        analise_id,
        parceiro_id: parceiroId,
        fonte: extraido.fonte || "manual",
        data_consulta: extraido.data_consulta || new Date().toISOString().split("T")[0],
        score_numerico: extraido.score_numerico,
        score_categorico: extraido.score_categorico,
        flag_pefin: extraido.flag_pefin,
        flag_refin: extraido.flag_refin,
        flag_protestos: extraido.flag_protestos,
        flag_falencia_rj: extraido.flag_falencia_rj,
        flag_acoes_judiciais: extraido.flag_acoes_judiciais,
        flag_cheque_devolvido: extraido.flag_cheque_devolvido,
        flag_divida_vencida: extraido.flag_divida_vencida,
        total_dividas: extraido.total_dividas,
        documento_storage_path,
        dados_extraidos_json: extraido,
        anexado_por: user.id,
        extraido_em: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (scoreErr) {
      console.error("Erro inserindo score:", scoreErr);
      return new Response(
        JSON.stringify({ error: `Erro persistindo: ${scoreErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        score_id: scoreInserido.id,
        fonte: extraido.fonte,
        cnpj_match: cnpjMatch,
        cnpj_warning: cnpjMatch ? null : `CNPJ do PDF (${cnpjExtraido}) difere do esperado (${cnpjLimpo})`,
        extraido,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("parse-bureau-pdf error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
