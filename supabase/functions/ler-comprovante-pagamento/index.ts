/**
 * Edge Function: ler-comprovante-pagamento
 *
 * Recebe { storage_path }, baixa o arquivo do bucket privado `comprovantes-pagamento`
 * com service role e manda para o modelo multimodal do Lovable AI Gateway.
 * Devolve SÓ o JSON lido. Fail-loud: nada de objeto vazio fingindo sucesso.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é um extrator de dados de COMPROVANTES DE PAGAMENTO brasileiros (PIX, cartão, boleto, TED).
Responda APENAS com JSON, sem markdown, sem explicação, exatamente com estas chaves:

{
  "tipo": "pix|cartao|boleto|ted|indefinido",
  "sentido": "entrada|saida|indefinido",
  "valor": 0,
  "data": "YYYY-MM-DD",
  "chave": "",
  "pagador": "",
  "pagador_documento": "",
  "beneficiario_nome": "",
  "beneficiario_cnpj": "",
  "instituicao": "",
  "confianca": "alta|media|baixa"
}

REGRAS (vindas de comprovantes reais):
1. "sentido" é "entrada" quando o dinheiro vai PARA a Fetely (CNPJ 63.591.078/0001-48) e "saida" quando SAI da Fetely para outra pessoa. Comprovante com "De: FETELY" (Fetely como pagador/origem) é "saida".
2. "chave": para PIX é o ID/E2E da transação (começa com E e tem ~32 caracteres) ou o ID do QR Code. Para cartão é o ID da transação / NSU. NUNCA invente: se não achar, devolva string vazia.
3. Se o comprovante trouxer um código do pedido (ex.: "COD PRODUTO: PED2145"), inclua em "chave" apenas se não houver E2E — o E2E tem prioridade.
4. "valor" é o valor da transação, número puro, ponto decimal, sem "R$" e sem separador de milhar.
5. "data" sempre no formato YYYY-MM-DD.
6. "confianca" é "baixa" quando a imagem estiver cortada, ilegível ou faltar valor/data.
7. "pagador_documento" é o CPF/CNPJ do pagador como aparece no comprovante (pode vir mascarado, ex. ***.123.456-**) — copie exatamente, nunca complete os dígitos ocultos.
8. Não simule dados: campo que não existe no comprovante vai como string vazia (ou 0 no valor).`;

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
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { storage_path?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Corpo da requisição não é JSON válido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const storagePath = (body.storage_path ?? "").trim();
    if (!storagePath) {
      return new Response(JSON.stringify({ error: "storage_path é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({
          error:
            "A chave da IA (LOVABLE_API_KEY) não está disponível nesta função. Sem ela o comprovante não pode ser lido.",
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: arquivo, error: erroDownload } = await admin.storage
      .from("comprovantes-pagamento")
      .download(storagePath);

    if (erroDownload || !arquivo) {
      return new Response(
        JSON.stringify({
          error: `Não foi possível baixar o comprovante do storage: ${erroDownload?.message ?? "arquivo não encontrado"}`,
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const arrayBuffer = await arquivo.arrayBuffer();
    const MAX_BYTES = 15 * 1024 * 1024;
    if (arrayBuffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: "O arquivo do comprovante está vazio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (arrayBuffer.byteLength > MAX_BYTES) {
      return new Response(
        JSON.stringify({
          error: `Comprovante grande demais para a IA: ${(arrayBuffer.byteLength / 1048576).toFixed(1)}MB (limite 15MB).`,
        }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const mime = arquivo.type || (storagePath.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
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
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          { type: "text", text: "Extraia os dados deste comprovante de pagamento conforme o schema JSON." },
        ],
      },
    ];

    const tentativas = [{ model: "google/gemini-2.5-pro" }, { model: "google/gemini-2.5-flash" }];

    let aiResponse: Response | null = null;
    let ultimoErro = "";

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
        console.error("AI Gateway fetch error:", ultimoErro);
        continue;
      }

      if (resp.ok) {
        aiResponse = resp;
        break;
      }

      const errText = await resp.text();
      ultimoErro = `modelo ${model} respondeu ${resp.status}: ${errText.slice(0, 500)}`;
      console.error("AI Gateway error:", { model, status: resp.status, body: errText.slice(0, 300) });

      if (resp.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de uso da IA atingido. Tente de novo em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados no workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (resp.status === 401 || resp.status === 403) {
        return new Response(
          JSON.stringify({ error: `Credencial de IA rejeitada pelo gateway (${resp.status}).` }),
          { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (resp.status === 400) {
        return new Response(
          JSON.stringify({ error: `A IA rejeitou o arquivo do comprovante — ${ultimoErro}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!aiResponse) {
      return new Response(
        JSON.stringify({ error: `A IA não conseguiu ler o comprovante — ${ultimoErro}` }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    let jsonStr = String(content).trim();
    jsonStr = jsonStr.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Falha ao parsear JSON da IA:", String(content).slice(0, 1000));
      return new Response(
        JSON.stringify({
          error: "A IA respondeu num formato que não é JSON válido.",
          raw: String(content).slice(0, 2000),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Response(
        JSON.stringify({ error: "A IA não devolveu um objeto de comprovante." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const leitura = {
      tipo: String(parsed.tipo ?? "indefinido"),
      sentido: String(parsed.sentido ?? "indefinido"),
      valor: Number(parsed.valor ?? 0) || 0,
      data: parsed.data ? String(parsed.data) : "",
      chave: parsed.chave ? String(parsed.chave) : "",
      pagador: parsed.pagador ? String(parsed.pagador) : "",
      beneficiario_nome: parsed.beneficiario_nome ? String(parsed.beneficiario_nome) : "",
      beneficiario_cnpj: parsed.beneficiario_cnpj ? String(parsed.beneficiario_cnpj) : "",
      instituicao: parsed.instituicao ? String(parsed.instituicao) : "",
      confianca: String(parsed.confianca ?? "baixa"),
      mime,
      bytes: arrayBuffer.byteLength,
    };

    return new Response(JSON.stringify(leitura), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro fatal:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
