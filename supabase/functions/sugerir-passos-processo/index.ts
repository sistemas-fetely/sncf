// Edge function: sugerir-passos-processo
// Lê a narrativa de um processo e propõe passos estruturados via Lovable AI Gateway.
// NUNCA escreve em processo_passo — grava apenas em processo_passo_sugerido com status 'pendente'.
// Doutrina: validado antes de alterar. O humano aceita ou rejeita cada sugestão.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MINIMO_NARRATIVA = 200;

const SYSTEM_PROMPT = `Você quebra a narrativa de um processo interno da Fetely em PASSOS verificáveis.

REGRAS INVIOLÁVEIS:
1. Você não inventa passo. Todo passo proposto tem que estar ancorado num pedaço literal da narrativa.
2. "trecho_origem" é uma CITAÇÃO LITERAL da narrativa (copie o texto, no máximo 400 caracteres). É o que permite ao humano conferir se você entendeu certo. Sem trecho literal, o passo é inútil.
3. Não transforme títulos de seção, objetivos, definições ou avisos em passo. Passo é ação executável por alguém.
4. Ordem = a sequência em que as ações acontecem na narrativa, começando em 1.
5. "nome" é curto e no imperativo ou infinitivo (máx. 80 caracteres). "descricao" explica o que precisa acontecer, em 1-2 frases.
6. Entre 3 e 25 passos. Se a narrativa não descreve execução, devolva lista vazia.
7. Português brasileiro, sem corporativês.

OUTPUT: JSON válido, sem markdown, sem texto fora do JSON:
{
  "passos": [
    { "ordem": 1, "nome": "…", "descricao": "…", "trecho_origem": "citação literal da narrativa" }
  ]
}`;

const MODELO_PRIMARIO = "openai/gpt-5.5";
const MODELO_FALLBACK = "google/gemini-2.5-pro";

/** Segredos vêm do vault, nunca de Deno.env — regra da casa. */
async function segredoDoVault(admin: any, nome: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_vault_secret", { p_name: nome });
  if (error) {
    console.error("[sugerir-passos-processo] vault:", nome, error.message);
    return null;
  }
  return data ? String(data) : null;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function chamarGateway(modelo: string, apiKey: string, userPrompt: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelo,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Não autorizado" });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json(401, { error: "Não autorizado" });

    // Cliente de serviço só para o vault; toda leitura/escrita de dados segue com o JWT do usuário.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const LOVABLE_API_KEY = await segredoDoVault(admin, "LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[sugerir-passos-processo] LOVABLE_API_KEY ausente no vault");
      return json(500, { error: "A chave da IA não está configurada no vault (LOVABLE_API_KEY)." });
    }

    const body = await req.json().catch(() => ({}));
    const processo_id = typeof body?.processo_id === "string" ? body.processo_id.trim() : "";
    if (!processo_id) return json(400, { error: "processo_id é obrigatório" });

    const { data: processo, error: erroProcesso } = await supabase
      .from("processos")
      .select("id, nome, codigo, descricao, narrativa")
      .eq("id", processo_id)
      .maybeSingle();

    if (erroProcesso) {
      console.error("[sugerir-passos-processo] leitura do processo:", erroProcesso.message);
      return json(500, { error: `Não leu o processo: ${erroProcesso.message}` });
    }
    if (!processo) return json(404, { error: "Processo não encontrado" });

    const narrativa = (processo.narrativa ?? "").trim();
    if (narrativa.length < MINIMO_NARRATIVA) {
      return json(422, {
        error:
          "Não há narrativa suficiente para inferir passos. Escreva a narrativa do processo primeiro — a IA só quebra o que já está escrito.",
        narrativa_caracteres: narrativa.length,
        minimo: MINIMO_NARRATIVA,
      });
    }

    const userPrompt = `PROCESSO: ${processo.nome} (${processo.codigo ?? "sem código"})
${processo.descricao ? `DESCRIÇÃO: ${processo.descricao}\n` : ""}
NARRATIVA (fonte única — todo trecho_origem tem que sair daqui, literal):
"""
${narrativa.slice(0, 40000)}
"""

Quebre esta narrativa em passos executáveis conforme o system prompt.`;

    let modeloUsado = MODELO_PRIMARIO;
    let resp = await chamarGateway(MODELO_PRIMARIO, LOVABLE_API_KEY, userPrompt);

    if (!resp.ok) {
      const erroTexto = await resp.text().catch(() => "");
      console.error(
        "[sugerir-passos-processo] modelo primário falhou:",
        MODELO_PRIMARIO,
        resp.status,
        erroTexto,
      );
      if (resp.status === 429) {
        return json(429, { error: "Limite de uso da IA atingido. Tente de novo em alguns minutos." });
      }
      if (resp.status === 402) {
        return json(402, { error: "Créditos de IA esgotados. Recarregue para continuar." });
      }
      const statusPrimario = resp.status;
      modeloUsado = MODELO_FALLBACK;
      resp = await chamarGateway(MODELO_FALLBACK, LOVABLE_API_KEY, userPrompt);
      if (!resp.ok) {
        const erroFb = await resp.text().catch(() => "");
        console.error("[sugerir-passos-processo] fallback falhou:", resp.status, erroFb);
        return json(502, {
          error: `IA indisponível (${MODELO_PRIMARIO} ${statusPrimario}, fallback ${MODELO_FALLBACK} ${resp.status})`,
        });
      }
    }

    const aiData = await resp.json();
    const conteudo: string = aiData?.choices?.[0]?.message?.content ?? "";
    if (!conteudo.trim()) {
      console.error("[sugerir-passos-processo] resposta vazia do modelo", modeloUsado);
      return json(502, { error: "A IA respondeu vazio. Tente novamente." });
    }

    const limpo = conteudo.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    let parsed: { passos?: unknown };
    try {
      parsed = JSON.parse(limpo);
    } catch {
      console.error("[sugerir-passos-processo] JSON inválido:", limpo.slice(0, 500));
      return json(502, { error: "A IA devolveu um formato que não pôde ser lido. Tente novamente." });
    }

    const brutos = Array.isArray(parsed?.passos) ? (parsed!.passos as Record<string, unknown>[]) : [];
    const propostos = brutos
      .map((p, i) => ({
        processo_id,
        ordem: Number(p?.ordem) > 0 ? Number(p.ordem) : i + 1,
        nome: String(p?.nome ?? "").trim().slice(0, 200),
        descricao: p?.descricao ? String(p.descricao).trim() : null,
        trecho_origem: p?.trecho_origem ? String(p.trecho_origem).trim().slice(0, 2000) : null,
        status: "pendente",
        modelo: modeloUsado,
        gerado_por: user.id,
      }))
      .filter((p) => p.nome.length > 0)
      .sort((a, b) => a.ordem - b.ordem)
      .map((p, i) => ({ ...p, ordem: i + 1 }));

    if (propostos.length === 0) {
      return json(422, {
        error:
          "A IA não encontrou ações executáveis nesta narrativa. Ela descreve conceito, não execução.",
      });
    }

    // Substitui só as sugestões ainda pendentes; aceitas e rejeitadas são histórico.
    const { error: erroLimpeza } = await supabase
      .from("processo_passo_sugerido")
      .delete()
      .eq("processo_id", processo_id)
      .eq("status", "pendente");
    if (erroLimpeza) {
      console.error("[sugerir-passos-processo] limpeza de pendentes:", erroLimpeza.message);
      return json(500, { error: `Não limpou as sugestões antigas: ${erroLimpeza.message}` });
    }

    const { data: gravados, error: erroInsert } = await supabase
      .from("processo_passo_sugerido")
      .insert(propostos)
      .select("id, ordem, nome, descricao, trecho_origem, status, gerado_em, modelo");
    if (erroInsert) {
      console.error("[sugerir-passos-processo] insert:", erroInsert.message);
      return json(500, { error: `Não gravou as sugestões: ${erroInsert.message}` });
    }

    return json(200, {
      ok: true,
      processo_id,
      modelo: modeloUsado,
      total: gravados?.length ?? 0,
      sugestoes: gravados ?? [],
    });
  } catch (e) {
    console.error("[sugerir-passos-processo] erro:", e);
    return json(500, { error: (e as Error).message || "Erro desconhecido" });
  }
});
