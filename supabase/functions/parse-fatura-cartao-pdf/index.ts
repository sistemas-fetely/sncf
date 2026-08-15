/**
 * Edge Function: parse-fatura-cartao-pdf
 *
 * Recebe um PDF de fatura de cartão de crédito e extrai via IA:
 * - dados do cartão (final)
 * - data de vencimento
 * - valor total
 * - lista de lançamentos (data, descrição, valor, parcela, internacional)
 *
 * URL Lovable AI Gateway: https://ai.gateway.lovable.dev/v1/chat/completions
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um extrator de dados de FATURAS DE CARTÃO DE CRÉDITO brasileiros.
Analise o PDF fornecido e extraia os seguintes campos em JSON:

{
  "cartao_numero_final": "9466",  // últimos 4 dígitos do cartão
  "data_vencimento": "2026-04-09",  // YYYY-MM-DD
  "data_emissao": "2026-03-26",  // YYYY-MM-DD
  "periodo_inicio": "2026-02-12",  // primeira data de lançamento
  "periodo_fim": "2026-03-26",  // última data de lançamento
  "valor_total": 6065.75,  // total da fatura (apenas o valor a pagar agora)
  "valor_pagamento_anterior": 5259.72,  // pagamento da fatura anterior (se houver)
  "valor_saldo_atraso": 0.00,
  "lancamentos": [
    {
      "data_compra": "2026-02-12",  // YYYY-MM-DD
      "descricao": "Nespresso 01/10",  // EXATAMENTE como aparece no PDF (incluindo parcela)
      "valor": 53.73,  // positivo = compra, negativo = estorno
      "natureza": "NACIONAL",  // ou "INTERNACIONAL"
      "moeda": "BRL",  // ou "USD", "EUR", etc
      "valor_original": null,  // se INTERNACIONAL, valor na moeda original
      "cotacao": null,  // se INTERNACIONAL, cotação aplicada
      "estabelecimento_local": "Sao Paulo",  // cidade/local do estabelecimento
      "ramo_estabelecimento": null  // descrição do ramo (ex: "ALIMENTAÇÃO", "DIVERSOS")
    }
  ]
}

REGRAS IMPORTANTES:
1. Pagamentos efetuados (linhas como "PAGAMENTO EFETUADO") devem aparecer como lançamentos com tipo "pagamento" e valor negativo. NÃO os inclua no valor_total.
2. Estornos (valores negativos no PDF, geralmente próximos de compras) devem ter valor negativo
3. IOF de operação internacional deve aparecer como lançamento separado com descrição contendo "IOF"
4. NÃO simule dados - se não conseguir ler algo, use null
5. Mantenha a descrição EXATAMENTE como no PDF, incluindo parcela atual (ex: se o PDF diz "Nespresso 01/10", retorne "Nespresso 01/10" — NÃO invente outras parcelas como 02/10, 03/10. Cada lançamento aparece UMA vez na fatura.)
6. valor_total é o "Total desta fatura" / "Total da sua fatura é"
7. Datas SEMPRE no formato YYYY-MM-DD
8. Valores como números (não strings, sem R$, ponto como decimal)
9. CRÍTICO: NÃO multiplique nem expanda lançamentos parcelados. Se o PDF tem UMA linha "Nespresso 01/10", retorne UMA linha. Não gere 02/10, 03/10, etc. — essas parcelas só aparecem em faturas futuras.

Responda APENAS com o JSON, sem markdown, sem explicações.`;

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
      return new Response(JSON.stringify({ error: "Arquivo PDF não enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "A chave da IA (LOVABLE_API_KEY) não está disponível nesta função. Sem ela o PDF não pode ser lido.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Converter PDF pra base64
    const arrayBuffer = await file.arrayBuffer();
    console.log("parse-fatura-cartao-pdf: pdf recebido", {
      bytes: arrayBuffer.byteLength,
      temChave: !!lovableApiKey,
    });
    const MAX_BYTES = 15 * 1024 * 1024;
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return new Response(
        JSON.stringify({
          error: `PDF grande demais para a IA: ${(arrayBuffer.byteLength / 1048576).toFixed(1)}MB (limite 15MB). Envie o CSV da fatura.`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);

    const mensagens = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
          { type: "text", text: "Extraia os dados desta fatura de cartão de crédito conforme o schema JSON." },
        ],
      },
    ];

    // Flash vem primeiro para testar timeout: se passar, era tempo; se falhar igual, é chave ou gateway.
    const tentativas: { model: string }[] = [
      { model: "google/gemini-2.5-flash" },
      { model: "google/gemini-2.5-pro" },
    ];

    let aiResponse: Response | null = null;
    let ultimoErro = "";
    let ultimoStatus = 502;

    for (let t = 0; t < tentativas.length; t++) {
      if (t > 0) await new Promise((r) => setTimeout(r, 1500 * t));
      const { model } = tentativas[t];
      let resp: Response;
      try {
        resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({ model, messages: mensagens }),
        });
      } catch (netErr) {
        ultimoErro = `falha de rede ao chamar a IA: ${netErr instanceof Error ? netErr.message : String(netErr)}`;
        ultimoStatus = 502;
        console.error("AI Gateway fetch error:", ultimoErro);
        continue;
      }

      if (resp.ok) {
        aiResponse = resp;
        break;
      }

      const errText = await resp.text();
      ultimoStatus = resp.status;
      ultimoErro = `modelo ${model} respondeu ${resp.status}: ${errText.slice(0, 500)}`;
      console.error("AI Gateway error:", {
        model,
        status: resp.status,
        body: errText.slice(0, 300),
      });

      // 429/402/401 não melhoram com retry de modelo
      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso da IA atingido. Tente de novo em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados no workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 401 || resp.status === 403) {
        return new Response(
          JSON.stringify({ error: `Credencial de IA rejeitada pelo gateway (${resp.status}).` }),
          { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!aiResponse) {
      return new Response(
        JSON.stringify({
          error:
            ultimoStatus === 503
              ? "O serviço de IA está temporariamente indisponível (503 no gateway) — 3 tentativas falharam. Tente de novo em alguns minutos ou importe o CSV da fatura."
              : `A IA não conseguiu ler o PDF — ${ultimoErro}`,
          detail: ultimoErro,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extrair JSON (a IA pode envolver em ``` por segurança)
    let jsonStr = content.trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/```\s*$/, "");

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (_e) {
      console.error("Falha ao parsear JSON da IA:", content.slice(0, 1000));
      return new Response(
        JSON.stringify({
          error: "A IA respondeu num formato que não é JSON válido.",
          raw: String(content).slice(0, 2000),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro fatal:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
