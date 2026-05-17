import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Limite de PDF: AI Gateway tem limite de payload + base64 cresce ~33%.
// 8MB de PDF vira ~11MB de base64 + JSON wrapper. Acima disso é arriscado.
const MAX_PDF_BYTES = 8 * 1024 * 1024;

// Conversão base64 chunked — evita estourar argumentos do String.fromCharCode
// em PDFs maiores. O loop char-by-char anterior consumia memória O(n) extra.
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
      return new Response(JSON.stringify({ error: "Arquivo PDF não enviado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validação de tamanho ANTES de carregar em memória
    if (file.size > MAX_PDF_BYTES) {
      console.error(`PDF acima do limite: ${file.size} bytes (max ${MAX_PDF_BYTES})`);
      return new Response(JSON.stringify({
        error: `PDF muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Limite: ${MAX_PDF_BYTES / 1024 / 1024}MB.`,
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processando PDF: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const base64 = uint8ArrayToBase64(bytes);

    // ============================================
    // PROMPT MULTI-TIPO: NF-e, NFS-e, Recibo, Boleto
    // ============================================
    const systemPrompt = `Você é um extrator de dados de documentos fiscais e financeiros.

Analise o PDF e identifique o TIPO do documento, depois extraia os campos.

TIPOS POSSÍVEIS:
1. "nfe" — NF-e brasileira de PRODUTO (DANFE com chave de acesso de 44 dígitos, NCM, CFOP, ICMS)
2. "nfse" — NFS-e brasileira de SERVIÇO (Nota Fiscal de Serviço Eletrônica, com prestador municipal, ISS, código de serviço)
3. "recibo" — Recibo/Invoice de empresa estrangeira (Anthropic, Lovable, AWS, Microsoft, Google, etc.) ou recibo brasileiro genérico SEM ser NF formal
4. "boleto" — Boleto bancário brasileiro (carnê, cobrança). Identificado pela LINHA DIGITÁVEL FEBRABAN (47 dígitos com pontos e espaços, ex: "23791.16003 02601.011110 65000.063307 7 89180000454279"). Pode mencionar "Boleto", "Beneficiário", "Pagador", "Vencimento", "Nosso Número", "Espécie DM/DS/Outros".

Responda APENAS com JSON neste formato (sem markdown, sem explicações):

{
  "tipo_documento": "nfe" | "nfse" | "recibo" | "boleto",
  "pais_emissor": "BR" | "US" | "EU" | etc (código ISO 2 letras, default BR),
  "moeda": "BRL" | "USD" | "EUR" | etc (código ISO 3 letras, default BRL),
  "valor": number (valor total SEMPRE convertido pra BRL — se documento estrangeiro, use a taxa de conversão informada no próprio documento; se não tiver taxa, retorne valor original e null em valor_origem). FORMATO BRASILEIRO: o ponto é separador de MILHAR e vírgula é separador DECIMAL. "R$ 4.542,79" = 4542.79 (NÃO 454279). "R$ 1.000,00" = 1000.00 (NÃO 100000). "R$ 12.345,67" = 12345.67. SEMPRE retornar com no máximo 2 casas decimais.,
  "valor_origem": number ou null (valor na moeda original — preencher SOMENTE se moeda != BRL),
  "taxa_conversao": number ou null (multiplicador moeda_origem → BRL — preencher SOMENTE se moeda != BRL),
  "data_emissao": string formato YYYY-MM-DD,
  "data_vencimento": string formato YYYY-MM-DD ou null,
  "descricao": string (descrição resumida dos itens/serviços, MÁXIMO 280 caracteres — se houver muitos itens, resuma como "N itens: primeiro item; segundo item; ..." sem listar todos),
  "numero_documento": string (número da NF para nfe/nfse, número do recibo/invoice, OU para boleto: "Nosso Número" ou "Número do Documento" do banco),
  "serie": string ou null (série, só pra NF-e/NFS-e brasileiras),
  "chave_acesso": string ou null (EXATAMENTE 44 dígitos pra NF-e, ID do InfNfse pra NFS-e. **OBRIGATORIAMENTE null pra recibo E boleto** — NUNCA preencher chave_acesso quando tipo_documento for boleto, mesmo que haja números longos no documento — esses são linha digitável, não chave.),
  "fornecedor_cnpj": string ou null (CNPJ do prestador/emissor — para boleto, é o CNPJ do BENEFICIÁRIO, apenas números, null se estrangeiro),
  "fornecedor_razao_social": string (razão social do prestador/emissor — para boleto, é a razão social do BENEFICIÁRIO),
  "linha_digitavel": string ou null (47 dígitos da linha digitável FEBRABAN, formato livre — só preencher se tipo_documento='boleto'),
  "numero_parcela": number ou null (número da parcela atual, ex: 3 em "3/8" — só pra boleto parcelado),
  "total_parcelas": number ou null (total de parcelas, ex: 8 em "3/8" — só pra boleto parcelado),
  "numero_documento_referencia": string ou null (número da NF que o boleto cobra, se mencionado no histórico/demonstrativo, ex: "ref NF 11151" → "11151". Se boleto NÃO cita NF, deixar null. Só pra boleto.),
  "confianca": "alta" se o tipo foi identificado com certeza (nfe com chave 44 dígitos confirmada, nfse com ID InfNfse, boleto com linha digitável FEBRABAN detectada). "baixa" em qualquer outro caso — recibo sem número formal, documento ambíguo, boleto sem linha digitável visível.
}

REGRAS DE BOLETO — LEIA COM MÁXIMA ATENÇÃO:

SINAL OBRIGATÓRIO: Para classificar como "boleto", o documento DEVE conter a LINHA DIGITÁVEL FEBRABAN
(sequência de ~47 dígitos no formato "XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXXXX",
com grupos separados por pontos e espaços, impressa no topo ou no corpo do boleto).
SEM ESSA LINHA → NÃO É BOLETO.

FALSO POSITIVO MAIS COMUM — "Nosso Número":
O campo "Nosso Número" aparece em boletos, MAS TAMBÉM em Notas de Adiantamento, Faturas de
Honorários e outros documentos administrativos que NÃO são boletos. "Nosso Número" sozinho NÃO
classifica como boleto. Só classifica como boleto se tiver a LINHA DIGITÁVEL.

EXEMPLOS DE RECIBO (não boleto):
- "Nota de Adiantamento" com "Nosso Número" mas sem linha digitável → tipo_documento="recibo"
- "Nota de Honorários" com valor e vencimento mas sem linha digitável → tipo_documento="recibo"
- "Fatura de Serviços" sem CNPJ NFS-e municipal e sem linha digitável → tipo_documento="recibo"

Outro sinal forte de boleto: código de barras bancário horizontal de 44 posições no rodapé.
Se houver NF-e DANFE NA MESMA PÁGINA do boleto, classifique como "nfe" (DANFE manda).
Boleto avulso (sem DANFE junto): tipo_documento="boleto", chave_acesso=null SEMPRE.
numero_parcela e total_parcelas: extrair de "3/8", "Parcela 3 de 8", "3 de 8".
numero_documento_referencia: procurar "ref NF X", "Refere-se à NF X", "Doc Fiscal X" no demonstrativo.
linha_digitavel é o ÚNICO lugar onde a sequência FEBRABAN aparece. NÃO copiar pra chave_acesso.

REGRAS DE MOEDA — LEIA COM ATENÇÃO:

REGRA DE OURO: Se documento contém TEXTO de conversão de moeda (ex: "Charged R$51.78 using 1 USD = 5.1777 BRL"), a MOEDA do documento é a ORIGINAL (USD), NÃO a final (BRL).

- Se documento brasileiro com CNPJ → pais_emissor="BR", moeda="BRL", valor_origem=null, taxa_conversao=null
- Se documento estrangeiro SEM conversão (cobrança nativa em USD/EUR) → moeda=moeda da cobrança, valor=valor original, valor_origem=null, taxa_conversao=null
- Se documento estrangeiro COM conversão explícita (texto tipo "Charged R$X using 1 USD = Y BRL") → moeda=moeda ORIGINAL (USD/EUR), valor=valor BRL convertido, valor_origem=valor na moeda original, taxa_conversao=taxa explicitada
- Se documento estrangeiro emitido DIRETAMENTE em BRL (ex: Anthropic emite R$1.001,06 nativo) → moeda="BRL", valor_origem=null, taxa_conversao=null

REGRA INVIOLÁVEL: NUNCA preencher valor_origem ou taxa_conversao quando moeda="BRL". Se moeda="BRL", esses 2 campos DEVEM ser null. Se documento tem conversão explícita, moeda NÃO É "BRL".

REGRAS GERAIS:
- numero_documento: pra NF-e/NFS-e use o número da nota; pra recibo use invoice number ou receipt number
- Se não conseguir extrair algum campo opcional, use null
- Se não conseguir identificar o tipo com certeza, escolha o mais provável e prossiga`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${base64}`,
                },
              },
              {
                type: "text",
                text: "Identifique o tipo e extraia os dados deste documento.",
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 3000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({
        error: "Erro ao processar PDF com IA",
        ai_status: aiResponse.status,
        ai_detail: errText.slice(0, 500),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response (may have markdown code blocks)
    let cleaned = content.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Tentativa de recuperação: resposta provavelmente truncada no meio de "descricao".
      // Corta no último campo conhecido válido e fecha o objeto.
      try {
        const lastValidComma = cleaned.lastIndexOf('",\n');
        if (lastValidComma > 0) {
          const truncated = cleaned.slice(0, lastValidComma + 1) + "\n}";
          parsed = JSON.parse(truncated);
          console.warn("Recovered from truncated AI response");
        } else {
          throw new Error("no recovery point");
        }
      } catch {
        console.error("Failed to parse AI response:", content);
        return new Response(
          JSON.stringify({
            error: "Não foi possível extrair dados do PDF",
            raw: content,
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Validação leve: garante campos mínimos com defaults
    const data = {
      tipo_documento: parsed.tipo_documento || "nfe",
      pais_emissor: parsed.pais_emissor || "BR",
      moeda: parsed.moeda || "BRL",
      valor: typeof parsed.valor === "number" ? parsed.valor : 0,
      valor_origem: parsed.valor_origem ?? null,
      taxa_conversao: parsed.taxa_conversao ?? null,
      data_emissao: parsed.data_emissao || null,
      data_vencimento: parsed.data_vencimento || null,
      descricao: parsed.descricao || null,
      numero_documento: parsed.numero_documento || null,
      serie: parsed.serie || null,
      chave_acesso: parsed.chave_acesso || null,
      fornecedor_cnpj: parsed.fornecedor_cnpj || null,
      fornecedor_razao_social: parsed.fornecedor_razao_social || null,
      // Campos específicos de boleto (null pra outros tipos)
      linha_digitavel: parsed.tipo_documento === "boleto" ? (parsed.linha_digitavel || null) : null,
      numero_parcela: parsed.tipo_documento === "boleto" && typeof parsed.numero_parcela === "number" ? parsed.numero_parcela : null,
      total_parcelas: parsed.tipo_documento === "boleto" && typeof parsed.total_parcelas === "number" ? parsed.total_parcelas : null,
      numero_documento_referencia: parsed.tipo_documento === "boleto" ? (parsed.numero_documento_referencia || null) : null,
      confianca: (parsed.confianca === "alta" || parsed.confianca === "baixa")
        ? parsed.confianca
        : "baixa", // default conservador: se IA não retornou, assume baixa
    };

    // ============================================
    // DEFESA EM PROFUNDIDADE: corrige inconsistências
    // ============================================
    // Caso 1: moeda='BRL' mas tem valor_origem/taxa preenchidos
    if (data.moeda === "BRL" && (data.valor_origem !== null || data.taxa_conversao !== null)) {
      console.warn("Inconsistência: moeda=BRL com conversão preenchida. Limpando.");
      data.valor_origem = null;
      data.taxa_conversao = null;
    }

    // Caso 2: valor_origem ou taxa_conversao isolado (precisa ambos ou nenhum)
    if ((data.valor_origem === null) !== (data.taxa_conversao === null)) {
      console.warn("Inconsistência: apenas um de valor_origem/taxa_conversao. Limpando ambos.");
      data.valor_origem = null;
      data.taxa_conversao = null;
    }

    // Caso 3: chave_acesso em recibo ou boleto — IA confundiu, limpa
    if (data.chave_acesso && (data.tipo_documento === "boleto" || data.tipo_documento === "recibo")) {
      console.warn(`Inconsistência: ${data.tipo_documento} com chave_acesso preenchida. Limpando.`);
      data.chave_acesso = null;
    }

    // Caso 4: chave_acesso de NF-e tem que ter exatamente 44 dígitos (validação de formato)
    if (data.chave_acesso && data.tipo_documento === "nfe") {
      const digitsOnly = String(data.chave_acesso).replace(/\D/g, "");
      if (digitsOnly.length === 44) {
        data.chave_acesso = digitsOnly;
      } else {
        console.warn(`chave_acesso de NF-e com tamanho inválido (${digitsOnly.length} dígitos). Limpando.`);
        data.chave_acesso = null;
      }
    }

    // Caso 5: valor suspeitosamente alto (provável erro de formato BR)
    // Se valor > 1 milhão E valor_origem é null E moeda é BRL, e o número é
    // exato múltiplo de 100, provável que a IA leu "1.234,56" como 123456
    if (data.valor > 1000000 && data.moeda === "BRL" && Number.isInteger(data.valor) && data.valor % 100 === 0) {
      const valorCorrigido = data.valor / 100;
      console.warn(`Valor suspeito de erro de formato BR: ${data.valor} → ${valorCorrigido}`);
      data.valor = valorCorrigido;
    }

    // Boleto sem linha digitável = confiança baixa (provavelmente recibo mal-classificado)
    if (data.tipo_documento === "boleto" && !data.linha_digitavel) {
      console.warn("Boleto sem linha digitável — rebaixando confiança pra baixa.");
      data.confianca = "baixa";
    }

    // Recibo nunca tem sinal forte → sempre confiança baixa
    if (data.tipo_documento === "recibo") {
      data.confianca = "baixa";
    }

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({
      error: "Erro interno",
      detail: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
