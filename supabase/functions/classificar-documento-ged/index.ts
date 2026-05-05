import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

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

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo não enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (file.size > MAX_PDF_BYTES) {
      return new Response(JSON.stringify({
        error: `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: 20MB.`,
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = uint8ArrayToBase64(bytes);

    const systemPrompt = `Você é um classificador de documentos empresariais.

Analise o documento e retorne classificação + resumo + dados-chave.

TIPOS POSSÍVEIS:
- "contrato": contrato comercial assinado
- "orcamento": orçamento, cotação ou proposta comercial com valores e prazos
- "proposta": proposta técnica (sem valores fixos ainda, ou cotação preliminar)
- "nf": Nota Fiscal (NF-e, NFS-e)
- "recibo": recibo de pagamento, invoice de empresa estrangeira
- "certidao": certidão (negativa, positiva, regularidade)
- "comprovante": comprovante de pagamento, transferência, depósito
- "aditivo": aditivo contratual, termo de aditamento
- "outro": qualquer outro tipo

Responda APENAS com JSON neste formato (sem markdown):

{
  "tipo_documento": "contrato" | "orcamento" | "proposta" | "nf" | "recibo" | "certidao" | "comprovante" | "aditivo" | "outro",
  "nome_sugerido": string (nome curto e descritivo, ex: "Orçamento Construtora ABC - Reforma Sede"),
  "parceiro_cnpj": string ou null (CNPJ do emissor/fornecedor, apenas números),
  "parceiro_razao_social": string ou null (razão social do emissor),
  "valor": number ou null (valor principal em BRL — formato brasileiro: R$ 4.542,79 = 4542.79),
  "data_emissao": string YYYY-MM-DD ou null,
  "data_validade": string YYYY-MM-DD ou null (para orçamento/proposta),
  "numero_documento": string ou null,
  "tags_sugeridas": array de até 5 strings (tags úteis em minúsculas, kebab-case ex: "reforma-escritorio", "saas", "ti"),
  "pontos_principais": array de até 5 strings (principais informações ou cláusulas/itens),
  "resumo": string (2-3 linhas resumindo o documento em linguagem simples),
  "confianca": "alta" | "baixa"
}

REGRAS:
- nome_sugerido deve ser curto e útil para identificar visualmente
- Se documento é de empresa estrangeira (Lovable, Anthropic, AWS, etc), parceiro_cnpj = null
- Se não conseguir extrair algum campo, use null
- tags_sugeridas em kebab-case (palavras separadas por hífen, sem acentos, minúsculas)
- pontos_principais: extrair os pontos mais relevantes (valores, prazos, multas, condições)
- Para orçamento/proposta: incluir validade e itens principais nos pontos`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: systemPrompt },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
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
