const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// BrasilAPI — endpoint público, gratuito, sem chave de API.
// https://brasilapi.com.br/docs#tag/CNPJ
const BRASILAPI_BASE = "https://brasilapi.com.br/api/cnpj/v1";

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

    const body = await req.json().catch(() => ({}));
    const cnpjRaw = String(body?.cnpj ?? "");
    const cnpj = cnpjRaw.replace(/\D/g, "");

    if (cnpj.length !== 14) {
      return new Response(
        JSON.stringify({ error: "CNPJ inválido (precisa ter 14 dígitos)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const resp = await fetch(`${BRASILAPI_BASE}/${cnpj}`, {
      headers: { Accept: "application/json" },
    });

    if (resp.status === 404) {
      return new Response(
        JSON.stringify({ found: false, motivo: "nao_encontrado" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!resp.ok) {
      console.error("BrasilAPI status", resp.status, await resp.text().catch(() => ""));
      return new Response(
        JSON.stringify({ error: `Receita indisponível (status ${resp.status})` }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const data = await resp.json();

    return new Response(
      JSON.stringify({
        found: true,
        cnpj: data.cnpj,
        razao_social: data.razao_social ?? "",
        nome_fantasia: data.nome_fantasia ?? "",
        situacao: data.descricao_situacao_cadastral ?? null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("consultar-cnpj error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro desconhecido" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
