import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AMBIENTE = (Deno.env.get("CORREIOS_AMBIENTE") ?? "PRODUCAO").toUpperCase();
const BASE_URL =
  AMBIENTE === "HOMOLOGACAO"
    ? "https://apihom.correios.com.br"
    : "https://api.correios.com.br";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function getToken(): Promise<string> {
  const { data: cached } = await supabase
    .from("correios_token")
    .select("token, expira_em")
    .eq("id", "singleton")
    .maybeSingle();

  const bufferMs = 5 * 60 * 1000;
  if (cached && new Date(cached.expira_em).getTime() - bufferMs > Date.now()) {
    return cached.token;
  }

  const basic = btoa(
    `${Deno.env.get("CORREIOS_ID")}:${Deno.env.get("CORREIOS_SENHA_API")}`,
  );
  const resp = await fetch(`${BASE_URL}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numero: Deno.env.get("CORREIOS_CARTAO") }),
  });
  if (!resp.ok) throw new Error(`Token (${resp.status}): ${await resp.text()}`);

  const json = await resp.json();
  await supabase.from("correios_token").upsert({
    id: "singleton",
    token: json.token,
    expira_em: json.expiraEm,
    ambiente: AMBIENTE,
    atualizado_em: new Date().toISOString(),
  });
  return json.token;
}

function ehEntregue(eventos: any[]): boolean {
  return eventos.some((e) => {
    const tipo = String(e?.tipo ?? "").toUpperCase();
    const desc = String(e?.descricao ?? "").toLowerCase();
    return tipo.startsWith("BD") || desc.includes("entregue");
  });
}

async function rastrearEGravar(token: string, codigo: string) {
  const c = codigo.trim().toUpperCase();
  let status_atual = "";
  let entregue = false;
  let eventos: any[] = [];
  let servico: string | null = null;
  let data_ultima: string | null = null;

  try {
    const resp = await fetch(`${BASE_URL}/srorastro/v1/objetos/${c}?resultado=T&idioma=pt-BR`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const bodyText = await resp.text();
    console.log(`SRO ${c} status=${resp.status} body=${bodyText.slice(0, 600)}`);

    if (!resp.ok) {
      status_atual = `[erro SRO ${resp.status}] ${bodyText.slice(0, 200)}`;
    } else {
      const json = JSON.parse(bodyText);
      const obj = json?.objetos?.[0] ?? {};
      eventos = obj.eventos ?? [];
      const ultimo = eventos[0] ?? null;
      servico = obj?.tipoPostal?.categoria ?? obj?.tipoPostal?.descricao ?? null;
      status_atual = ultimo?.descricao ?? obj?.mensagem ?? "(sem eventos)";
      data_ultima = ultimo?.dtHrCriado ?? null;
      entregue = ehEntregue(eventos);
    }
  } catch (e) {
    status_atual = `[exceção] ${String(e).slice(0, 200)}`;
    console.log(`SRO ${c} exceção: ${e}`);
  }

  const registro = {
    codigo_rastreio: c,
    servico,
    status_atual,
    data_ultima_atualizacao: data_ultima,
    entregue,
    eventos,
    atualizado_em: new Date().toISOString(),
  };

  // SEMPRE grava (insere ou atualiza) — pra ficar visível na tela
  const { error } = await supabase
    .from("pedido_rastreamento")
    .upsert(registro, { onConflict: "codigo_rastreio" });
  if (error) {
    console.log(`UPSERT erro ${c}: ${error.message}`);
    return { codigo: c, status: `[erro gravação] ${error.message}` };
  }

  return { codigo: c, status: status_atual, entregue };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    let codigos: string[] = Array.isArray(body?.codigos) ? body.codigos : [];

    if (codigos.length === 0) {
      const { data } = await supabase
        .from("pedido_rastreamento")
        .select("codigo_rastreio")
        .eq("entregue", false);
      codigos = (data ?? []).map((r: any) => r.codigo_rastreio);
    }

    if (codigos.length === 0) {
      return new Response(JSON.stringify({ atualizados: [], msg: "Nada a rastrear." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getToken();
    const atualizados = [];
    for (const cod of codigos) {
      atualizados.push(await rastrearEGravar(token, cod));
    }

    return new Response(JSON.stringify({ atualizados }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
