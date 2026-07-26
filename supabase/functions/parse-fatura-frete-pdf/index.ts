/**
 * Edge Function: parse-fatura-frete-pdf
 *
 * Recebe um PDF de fatura de frete (Ícaro/Braspress) + transportadora_id,
 * extrai via Lovable AI Gateway (google/gemini-2.5-pro) e persiste chamando
 * a RPC public.fn_importar_fatura_frete(p_transportadora_id, p_payload).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um extrator de dados de FATURAS DE FRETE brasileiras (Ícaro, Braspress e similares).
Analise o PDF fornecido e responda APENAS com um JSON no formato:

{
  "numero_fatura": "40459",
  "data_emissao": "2026-06-15",       // YYYY-MM-DD
  "data_vencimento": "2026-06-25",    // YYYY-MM-DD
  "valor_total": 2793.36,             // valor total a pagar da fatura, número puro
  "lancamentos": [
    {
      "data": "2026-06-09",           // YYYY-MM-DD (data do embarque/CT-e)
      "doc_ref": "3048066",           // nº do documento de frete
      "nf_numero": "45",              // nº da NF do embarque
      "destinatario": "LAGUNES",      // nome do destinatário/tomador
      "valor_frete": 395.40,          // valor cobrado nesta linha
      "valor_nf": 4648.04,            // valor da NF (se houver), senão null
      "peso": 30,                     // peso em kg (número), senão null
      "tipo": "frete"                 // frete | credito | debito | devolucao
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. doc_ref = número do documento de frete:
   - Ícaro (coluna "Doc/Minuta" tipo "3048066/1"): use apenas o primeiro número ANTES da barra "/".
   - Braspress: use o AWB.
2. Todas as datas em YYYY-MM-DD.
3. Todos os valores como número (sem "R$", sem separador de milhar, ponto como decimal).
4. Linhas de crédito / débito / reversão / devolução:
   - tipo = "credito" | "debito" | "devolucao"
   - valor_frete = valor exatamente como no PDF (positivo se o PDF mostra positivo, negativo se mostra negativo).
5. NÃO invente linhas. Se um campo não aparece no PDF, use null (exceto tipo, que é sempre preenchido).
6. NÃO duplique linhas nem repita o header como lançamento.
7. Responda APENAS o JSON puro, sem markdown, sem \`\`\`, sem explicação.`;

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    const transportadoraId = formData.get("transportadora_id") as string | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "Arquivo PDF não enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!transportadoraId) {
      return new Response(JSON.stringify({ error: "transportadora_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PDF -> base64
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    // Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
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
                text: "Extraia os dados desta fatura de frete conforme o schema JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `Falha na IA: ${aiResponse.status}`, detail: errText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    let jsonStr = content.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "");

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (_e) {
      console.error("Falha ao parsear JSON da IA:", content);
      return new Response(
        JSON.stringify({ error: "IA retornou JSON inválido", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Persistir via RPC (service-role para bypass de RLS controlado pela função)
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: rpcData, error: rpcError } = await admin.rpc("fn_importar_fatura_frete", {
      p_transportadora_id: transportadoraId,
      p_payload: parsed,
    });

    if (rpcError) {
      console.error("RPC fn_importar_fatura_frete error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message, payload: parsed }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, result: rpcData, payload: parsed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
