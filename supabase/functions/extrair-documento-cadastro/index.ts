/**
 * Edge Function: extrair-documento-cadastro
 *
 * Recebe { pessoa_id, documento_tipo, storage_path }, baixa o documento do bucket
 * privado `documentos-cadastro` com service role e pede ao modelo multimodal do
 * Lovable AI Gateway os campos que `cadastro_requisito` mapeia para aquele tipo.
 *
 * PROMPT-VEM-DA-TABELA: a lista de campos NUNCA é hardcoded. Uma linha nova em
 * `cadastro_requisito` passa a ser extraída sem deploy.
 *
 * Esta função só SUGERE: grava `cadastro_extracao` + `cadastro_extracao_campo`.
 * Nada entra em `pessoas`/`vinculos` aqui — quem aplica é `fn_extracao_aplicar`,
 * depois da conferência humana.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const LISTAS_FECHADAS: Record<string, string[]> = {
  escolaridade: [
    "Fundamental incompleto",
    "Fundamental completo",
    "Médio incompleto",
    "Médio completo",
    "Técnico",
    "Superior incompleto",
    "Superior completo",
    "Pós-graduação",
    "Mestrado",
    "Doutorado",
  ],
  pj_regime_tributario: ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"],
};

const CONFIANCA_NUM: Record<string, number> = { alta: 0.9, media: 0.6, baixa: 0.3 };

type Requisito = { entidade: string; campo: string; rotulo: string; obrigatorio: boolean };

function montarSystemPrompt(nomeDocumento: string, requisitos: Requisito[]) {
  const schema = [
    "{",
    ...requisitos.map((r) => `  "${r.campo}": "",`),
    '  "confianca": "alta|media|baixa"',
    "}",
  ].join("\n");

  const lista = requisitos
    .map((r) => `- "${r.campo}": ${r.rotulo}${r.obrigatorio ? " (obrigatório no cadastro)" : ""}`)
    .join("\n");

  const restricoes = requisitos
    .filter((r) => LISTAS_FECHADAS[r.campo])
    .map(
      (r) =>
        `- "${r.campo}" só aceita EXATAMENTE um destes valores: ${LISTAS_FECHADAS[r.campo].join(" · ")}. Se o documento não permitir escolher com segurança, devolva string vazia e baixe a confiança.`,
    )
    .join("\n");

  return `Você é um extrator de DOCUMENTOS BRASILEIROS de cadastro de pessoal.
O documento sendo lido é: ${nomeDocumento}.

Responda APENAS com JSON, sem markdown, sem explicação, exatamente com estas chaves:

${schema}

Campos pedidos (o rótulo diz o que procurar no documento):
${lista}

REGRAS:
1. Campo que não existir ou não estiver legível no documento vai como string vazia. NUNCA invente, nunca deduza, nunca complete com valor plausível.
2. Datas sempre no formato YYYY-MM-DD.
3. CPF, CNPJ, CEP e PIS: só os dígitos, sem pontuação, sem espaços.
4. "confianca" é "baixa" quando a imagem estiver cortada, tremida ou ilegível.
5. Não acrescente chaves que não estão no schema.${restricoes ? `\n\nVALORES DE LISTA FECHADA:\n${restricoes}` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);

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
    if (!user) return json({ error: "Não autorizado" }, 401);

    let body: { pessoa_id?: string; documento_tipo?: string; storage_path?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Corpo da requisição não é JSON válido." }, 400);
    }
    const pessoaId = (body.pessoa_id ?? "").trim();
    const documentoTipo = (body.documento_tipo ?? "").trim();
    const storagePath = (body.storage_path ?? "").trim();
    if (!pessoaId) return json({ error: "pessoa_id é obrigatório." }, 400);
    if (!documentoTipo) return json({ error: "documento_tipo é obrigatório." }, 400);
    if (!storagePath) return json({ error: "storage_path é obrigatório." }, 400);

    if (!lovableApiKey) {
      return json(
        {
          error:
            "A chave da IA (LOVABLE_API_KEY) não está disponível nesta função. Sem ela o documento não pode ser lido.",
        },
        503,
      );
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // ── PROMPT-VEM-DA-TABELA: quais campos este documento deve entregar ──
    const { data: requisitosRaw, error: erroReq } = await admin
      .from("cadastro_requisito")
      .select("entidade, campo, rotulo, obrigatorio")
      .eq("ativo", true)
      .eq("documento_tipo", documentoTipo)
      .order("ordem");

    if (erroReq) {
      return json({ error: `Não foi possível ler os campos mapeados: ${erroReq.message}` }, 500);
    }
    const requisitos = (requisitosRaw ?? []) as Requisito[];
    if (requisitos.length === 0) {
      return json({ error: "Nenhum campo mapeado para este tipo de documento." }, 400);
    }

    const { data: tipoRow } = await admin
      .from("cadastro_documento_tipo")
      .select("nome")
      .eq("codigo", documentoTipo)
      .maybeSingle();
    const nomeDocumento = tipoRow?.nome ?? documentoTipo;

    // ── vínculo ativo (pode ser null; a RPC de aplicar é que recusa) ──
    const { data: vinculoRow } = await admin
      .from("vinculos")
      .select("id")
      .eq("pessoa_id", pessoaId)
      .eq("status", "ativo")
      .order("data_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();
    const vinculoId: string | null = vinculoRow?.id ?? null;

    const registrarErro = async (mensagem: string) => {
      await admin.from("cadastro_extracao").insert({
        pessoa_id: pessoaId,
        vinculo_id: vinculoId,
        documento_tipo: documentoTipo,
        storage_path: storagePath,
        status: "erro",
        erro: mensagem.slice(0, 2000),
        criado_por: user.id,
        processado_em: new Date().toISOString(),
      });
    };

    // ── download do documento ──
    const { data: arquivo, error: erroDownload } = await admin.storage
      .from("documentos-cadastro")
      .download(storagePath);

    if (erroDownload || !arquivo) {
      const msg = `Não foi possível baixar o documento do storage: ${erroDownload?.message ?? "arquivo não encontrado"}`;
      await registrarErro(msg);
      return json({ error: msg }, 404);
    }

    const arrayBuffer = await arquivo.arrayBuffer();
    const MAX_BYTES = 15 * 1024 * 1024;
    if (arrayBuffer.byteLength === 0) {
      await registrarErro("O arquivo do documento está vazio.");
      return json({ error: "O arquivo do documento está vazio." }, 400);
    }
    if (arrayBuffer.byteLength > MAX_BYTES) {
      const msg = `Documento grande demais para a IA: ${(arrayBuffer.byteLength / 1048576).toFixed(1)}MB (limite 15MB).`;
      await registrarErro(msg);
      return json({ error: msg }, 413);
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
      { role: "system", content: montarSystemPrompt(nomeDocumento, requisitos) },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
          {
            type: "text",
            text: `Extraia os campos pedidos deste documento (${nomeDocumento}) conforme o schema JSON.`,
          },
        ],
      },
    ];

    const tentativas = [{ model: "google/gemini-2.5-pro" }, { model: "google/gemini-2.5-flash" }];

    let aiResponse: Response | null = null;
    let modeloUsado = "";
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
        modeloUsado = model;
        break;
      }

      const errText = await resp.text();
      ultimoErro = `modelo ${model} respondeu ${resp.status}: ${errText.slice(0, 500)}`;
      console.error("AI Gateway error:", { model, status: resp.status, body: errText.slice(0, 300) });

      if (resp.status === 429) {
        await registrarErro(ultimoErro);
        return json({ error: "Limite de uso da IA atingido. Tente de novo em alguns minutos." }, 429);
      }
      if (resp.status === 402) {
        await registrarErro(ultimoErro);
        return json({ error: "Créditos de IA esgotados no workspace." }, 402);
      }
      if (resp.status === 401 || resp.status === 403) {
        await registrarErro(ultimoErro);
        return json({ error: `Credencial de IA rejeitada pelo gateway (${resp.status}).` }, resp.status);
      }
      if (resp.status === 400) {
        await registrarErro(ultimoErro);
        return json({ error: `A IA rejeitou o arquivo do documento — ${ultimoErro}` }, 400);
      }
    }

    if (!aiResponse) {
      await registrarErro(ultimoErro || "a IA não respondeu");
      return json({ error: `A IA não conseguiu ler o documento — ${ultimoErro}` }, 503);
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
      await registrarErro("A IA respondeu num formato que não é JSON válido.");
      return json(
        {
          error: "A IA respondeu num formato que não é JSON válido.",
          raw: String(content).slice(0, 2000),
        },
        502,
      );
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      await registrarErro("A IA não devolveu um objeto de campos.");
      return json({ error: "A IA não devolveu um objeto de campos." }, 502);
    }

    // ── confiança: cai um degrau se algum valor sair da lista fechada ──
    let confianca = String(parsed.confianca ?? "baixa").toLowerCase();
    if (!CONFIANCA_NUM[confianca]) confianca = "baixa";
    const foraDaLista = requisitos.some((r) => {
      const permitidos = LISTAS_FECHADAS[r.campo];
      const v = parsed[r.campo] == null ? "" : String(parsed[r.campo]).trim();
      return permitidos && v !== "" && !permitidos.includes(v);
    });
    if (foraDaLista) confianca = confianca === "alta" ? "media" : "baixa";
    const confiancaNum = CONFIANCA_NUM[confianca];

    // ── reenvio não gera duas filas de conferência ──
    await admin
      .from("cadastro_extracao")
      .update({ status: "descartado" })
      .eq("pessoa_id", pessoaId)
      .eq("documento_tipo", documentoTipo)
      .eq("status", "extraido");

    const { data: extracao, error: erroExtracao } = await admin
      .from("cadastro_extracao")
      .insert({
        pessoa_id: pessoaId,
        vinculo_id: vinculoId,
        documento_tipo: documentoTipo,
        storage_path: storagePath,
        status: "extraido",
        modelo: modeloUsado,
        bruto: parsed,
        criado_por: user.id,
        processado_em: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (erroExtracao || !extracao) {
      return json(
        { error: `Não foi possível registrar a extração: ${erroExtracao?.message ?? "sem retorno"}` },
        500,
      );
    }

    // ── valores atuais em pessoas/vinculos (só leitura) ──
    const camposPessoa = requisitos.filter((r) => r.entidade === "pessoa").map((r) => r.campo);
    const camposVinculo = requisitos.filter((r) => r.entidade === "vinculo").map((r) => r.campo);

    let pessoaAtual: Record<string, unknown> = {};
    if (camposPessoa.length > 0) {
      const { data } = await admin
        .from("pessoas")
        .select(camposPessoa.join(", "))
        .eq("id", pessoaId)
        .maybeSingle();
      pessoaAtual = (data ?? {}) as Record<string, unknown>;
    }
    let vinculoAtual: Record<string, unknown> = {};
    if (camposVinculo.length > 0 && vinculoId) {
      const { data } = await admin
        .from("vinculos")
        .select(camposVinculo.join(", "))
        .eq("id", vinculoId)
        .maybeSingle();
      vinculoAtual = (data ?? {}) as Record<string, unknown>;
    }

    const paraTexto = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

    let preenchidos = 0;
    const linhas = requisitos.map((r) => {
      const bruto = parsed[r.campo] == null ? "" : String(parsed[r.campo]).trim();
      if (bruto !== "") preenchidos++;
      const atual = r.entidade === "vinculo" ? vinculoAtual[r.campo] : pessoaAtual[r.campo];
      return {
        extracao_id: extracao.id,
        entidade: r.entidade,
        campo: r.campo,
        rotulo: r.rotulo,
        valor_sugerido: bruto === "" ? null : bruto,
        valor_atual: paraTexto(atual),
        confianca: bruto === "" ? null : confiancaNum,
      };
    });

    const { error: erroCampos } = await admin.from("cadastro_extracao_campo").insert(linhas);
    if (erroCampos) {
      await admin
        .from("cadastro_extracao")
        .update({ status: "erro", erro: `Falha ao gravar campos: ${erroCampos.message}`.slice(0, 2000) })
        .eq("id", extracao.id);
      return json({ error: `Não foi possível gravar os campos sugeridos: ${erroCampos.message}` }, 500);
    }

    return json({
      extracao_id: extracao.id,
      documento_tipo: documentoTipo,
      total_campos: requisitos.length,
      preenchidos,
      confianca,
    });
  } catch (e) {
    console.error("Erro fatal:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
