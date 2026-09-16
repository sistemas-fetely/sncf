// Edge function: ler-relatorio-consignado
// Lê o relatório de acerto consignado (PDF ou imagem) com IA e devolve
// APENAS codigo + quantidade vendida, mais o período apurado se existir.
// PREVIA-É-UMA-SÓ: aqui não se grava nada; o retorno alimenta a mesma prévia
// validada por resolver_reporte_consignado.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você extrai linhas de itens VENDIDOS de relatórios de acerto de consignado.

REGRAS DURAS:
- Para cada item, devolva o CÓDIGO do produto e a QUANTIDADE VENDIDA no período.
- NUNCA devolva a quantidade da nota/remessa, o estoque restante, o preço ou o valor total.
- O código é o identificador da PRIMEIRA coluna. Pode ser numérico com zeros à esquerda (ex: 01846) ou alfanumérico com pontos (ex: CUPBOD.LG.V.9). Preserve exatamente como está, com zeros à esquerda.
- Descrições contêm números que NÃO são quantidade: "Prato Fundo Piacera, 26 cm" — 26 é medida. Ignore números dentro da descrição.
- Ignore cabeçalhos, totais, subtotais e rodapés.
- Se o item aparecer com quantidade vendida zero ou vazia, não inclua.
- Se o documento trouxer período de apuração (datas de início e fim), extraia em ISO YYYY-MM-DD. Se não houver, use null.

RESPONDA SOMENTE JSON VÁLIDO, sem markdown, sem texto fora do JSON:
{"periodo_inicio":"YYYY-MM-DD"|null,"periodo_fim":"YYYY-MM-DD"|null,"itens":[{"codigo":"...","quantidade":N}]}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    const body = (await req.json().catch(() => null)) as
      | { arquivo_base64?: string; mime_type?: string; nome_arquivo?: string }
      | null;

    const base64 = String(body?.arquivo_base64 ?? "").replace(/^data:[^;]+;base64,/, "").trim();
    const mime = String(body?.mime_type ?? "application/pdf").trim() || "application/pdf";
    const nome = String(body?.nome_arquivo ?? "relatorio").trim();

    if (!base64) return json({ error: "arquivo_base64 é obrigatório" }, 400);

    const MODELOS = ["google/gemini-3.8-flash", "google/gemini-3.7-flash", "google/gemini-3.5-flash"];

    const payload = {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            mime === "application/pdf"
              ? { type: "file", file: { filename: nome, file_data: `data:${mime};base64,${base64}` } }
              : { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
            {
              type: "text",
              text: `Extraia os itens vendidos do relatório "${nome}". Só código e quantidade vendida.`,
            },
          ],
        },
      ],
    };

    const chamarGateway = (modelo: string) =>
      fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify({ model: modelo, ...payload }),
      });

    let aiResp: Response | null = null;
    let modeloUsado: string | null = null;
    let ultimoStatus = 0;
    let ultimoDetalhe = "";

    for (const modelo of MODELOS) {
      aiResp = await chamarGateway(modelo);
      if (aiResp.ok) {
        modeloUsado = modelo;
        break;
      }
      const detalhe = await aiResp.text().catch(() => "");
      ultimoStatus = aiResp.status;
      ultimoDetalhe = detalhe;
      console.error("gateway", modelo, aiResp.status, detalhe);
      // 429 e 402 não melhoram trocando de modelo — devolve a mensagem específica.
      if (aiResp.status === 429 || aiResp.status === 402) {
        const msg =
          aiResp.status === 429
            ? "A IA está sobrecarregada. Tente de novo em alguns instantes."
            : "Créditos de IA esgotados no workspace.";
        return json({ error: msg }, aiResp.status);
      }
      aiResp = null;
      // 400/404 = modelo inexistente/não suportado; demais = tenta o próximo.
    }

    if (!aiResp || !modeloUsado) {
      const msg = `A IA recusou a leitura (${ultimoStatus}). ${ultimoDetalhe.slice(0, 300)}`;
      return json({ error: msg }, 502);
    }
    console.log("modelo que respondeu:", modeloUsado);

    const aiData = await aiResp.json();
    const raw = String(aiData?.choices?.[0]?.message?.content ?? "").trim();

    let texto = raw;
    const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (cerca) texto = cerca[1].trim();
    const ini = texto.indexOf("{");
    const fim = texto.lastIndexOf("}");
    if (ini !== -1 && fim !== -1) texto = texto.slice(ini, fim + 1);

    let extraido: any;
    try {
      extraido = JSON.parse(texto);
    } catch (_e) {
      console.error("json inválido:", raw.slice(0, 500));
      return json({ error: "A IA devolveu um texto que não é JSON. Tente novamente ou cole o texto à mão." }, 502);
    }

    const dataIso = (v: unknown) => {
      const s = String(v ?? "").trim();
      return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
    };

    const itens = Array.isArray(extraido?.itens)
      ? extraido.itens
          .map((it: any) => ({
            codigo: String(it?.codigo ?? "").trim(),
            quantidade: Number(it?.quantidade),
          }))
          .filter((it: any) => it.codigo && Number.isFinite(it.quantidade) && it.quantidade > 0)
      : [];

    return json({
      periodo_inicio: dataIso(extraido?.periodo_inicio),
      periodo_fim: dataIso(extraido?.periodo_fim),
      itens,
      nome_arquivo: nome,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("erro", msg);
    return json({ error: msg }, 500);
  }
});
