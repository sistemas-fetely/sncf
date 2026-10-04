import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// Leitor de COMMERCIAL INVOICE de importação (Doutrina #167: documento de
// remessa entra pelo embarque). Só lê — não grava nada no banco. Quem grava é
// a RPC lancar_invoice_importacao, chamada pelo LancarInvoiceDialog.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PDF_BYTES = 8 * 1024 * 1024;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const TOOL = {
  type: "function",
  function: {
    name: "registrar_invoice",
    description: "Registra os dados extraídos de uma commercial invoice de importação.",
    parameters: {
      type: "object",
      properties: {
        cabecalho: {
          type: "object",
          properties: {
            numero: { type: "string" },
            data_emissao: { type: "string", description: "YYYY-MM-DD" },
            moeda: { type: "string" },
            incoterm: { type: "string" },
            porto_origem: { type: "string" },
            porto_destino: { type: "string" },
            conteineres: { type: "array", items: { type: "string" } },
            total_quantidade: { type: "number" },
            total_valor: { type: "number" },
          },
          required: ["numero", "moeda", "conteineres", "total_quantidade", "total_valor"],
        },
        linhas: {
          type: "array",
          items: {
            type: "object",
            properties: {
              item_seq: { type: "number" },
              marca: { type: "string" },
              ean: { type: "string" },
              descricao: { type: "string" },
              quantidade: { type: "number" },
              valor_unit: { type: "number" },
              valor: { type: "number" },
              setup: { type: "number" },
              valor_total: { type: "number" },
            },
            required: ["item_seq", "marca", "descricao", "quantidade", "valor_unit", "valor", "setup", "valor_total"],
          },
        },
        avisos: { type: "array", items: { type: "string" } },
      },
      required: ["cabecalho", "linhas"],
    },
  },
};

const SYSTEM = `Você extrai dados de uma COMMERCIAL INVOICE de importação (China → Brasil).
REGRAS:
- Leia TODAS as linhas de itens de TODAS as páginas. Não pule nenhuma, não resuma.
- Não invente: campo que não está no documento fica vazio (string vazia) ou 0 para setup.
- "numero": número da invoice EXATAMENTE como impresso (mesmas letras, hífens, barras).
- "data_emissao" em YYYY-MM-DD.
- "conteineres": números de contêiner (ex.: "TCNU3969667"), sem repetir.
- "total_quantidade": quantidade total do documento; "total_valor": valor FINAL do documento (linha "BALANCE"/total geral).
- Por linha: "marca" = coluna SHIPPING MARKS (ex.: "02058", manter zeros à esquerda); "ean" = código de barras;
  "valor" = AMOUNT; "setup" = SET UP COST (0 se não houver); "valor_total" = BALANCE da linha (= valor + setup).
- Números com ponto decimal (ex.: 1234.56).
- NÃO devolva nome, endereço ou qualquer identificação do exportador/fábrica/vendedor (segredo comercial).
- Em "avisos", liste dúvidas de leitura (páginas ilegíveis, valores ambíguos).`;

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "Não autorizado" }, 401);

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return json({ ok: false, error: "Não autorizado" }, 401);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) return json({ ok: false, error: "LOVABLE_API_KEY não configurada" }, 500);

    const body = await req.json().catch(() => null);
    const arquivo = body?.arquivo_base64;
    const nome = body?.nome_arquivo;
    if (typeof arquivo !== "string" || arquivo.length === 0 || typeof nome !== "string") {
      return json({ ok: false, error: "Envie { arquivo_base64, nome_arquivo }." }, 400);
    }
    const base64 = arquivo.replace(/^data:[^,]*,/, "");
    if (base64.length * 0.75 > MAX_PDF_BYTES) {
      return json({ ok: false, error: `PDF muito grande. Limite: ${MAX_PDF_BYTES / 1024 / 1024}MB.` }, 413);
    }

    console.log(`parse-invoice-pdf: ${nome} (${((base64.length * 0.75) / 1024).toFixed(1)}KB)`);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableApiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
              { type: "text", text: "Extraia o cabeçalho e TODAS as linhas desta invoice." },
            ],
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "registrar_invoice" } },
        temperature: 0,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errText);
      const msg = aiResponse.status === 429
        ? "Limite de uso da IA atingido. Tente de novo em instantes."
        : aiResponse.status === 402
        ? "Créditos de IA esgotados no workspace."
        : "Erro ao processar PDF com IA";
      return json({ ok: false, error: msg, ai_status: aiResponse.status }, aiResponse.status === 429 || aiResponse.status === 402 ? aiResponse.status : 502);
    }

    const aiData = await aiResponse.json();
    const args = aiData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: any;
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : args;
    } catch {
      parsed = null;
    }
    if (!parsed?.cabecalho || !Array.isArray(parsed?.linhas)) {
      console.error("Resposta da IA sem estrutura:", JSON.stringify(aiData).slice(0, 1000));
      return json({ ok: false, error: "Não foi possível extrair a invoice do PDF." }, 422);
    }

    const c = parsed.cabecalho;
    const cabecalho = {
      numero: s(c.numero),
      data_emissao: /^\d{4}-\d{2}-\d{2}$/.test(s(c.data_emissao)) ? s(c.data_emissao) : null,
      moeda: s(c.moeda).toUpperCase() || null,
      incoterm: s(c.incoterm).toUpperCase() || null,
      porto_origem: s(c.porto_origem) || null,
      porto_destino: s(c.porto_destino) || null,
      conteineres: Array.from(new Set((Array.isArray(c.conteineres) ? c.conteineres : []).map(s).filter(Boolean))),
      total_quantidade: n(c.total_quantidade),
      total_valor: n(c.total_valor),
    };
    const linhas = parsed.linhas.map((l: any, i: number) => ({
      item_seq: n(l.item_seq) || i + 1,
      marca: s(l.marca),
      ean: s(l.ean).replace(/\D/g, ""),
      descricao: s(l.descricao),
      quantidade: n(l.quantidade),
      valor_unit: n(l.valor_unit),
      valor: n(l.valor),
      setup: n(l.setup),
      valor_total: n(l.valor_total),
    }));
    const avisos: string[] = Array.isArray(parsed.avisos) ? parsed.avisos.map(s).filter(Boolean) : [];
    if (!cabecalho.numero) avisos.push("Número da invoice não encontrado.");
    if (linhas.length === 0) avisos.push("Nenhuma linha de item encontrada.");

    return json({ ok: true, cabecalho, linhas, avisos });
  } catch (err) {
    console.error("Error:", err);
    return json({ ok: false, error: "Erro interno", detail: err instanceof Error ? err.message : String(err) }, 500);
  }
});
