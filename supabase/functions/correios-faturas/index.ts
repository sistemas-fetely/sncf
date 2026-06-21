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

async function getTokenContrato(): Promise<string> {
  const { data: cached } = await supabase
    .from("correios_token")
    .select("token, expira_em")
    .eq("id", "contrato")
    .maybeSingle();

  const bufferMs = 5 * 60 * 1000;
  if (cached && new Date(cached.expira_em).getTime() - bufferMs > Date.now()) {
    return cached.token;
  }

  const basic = btoa(
    `${Deno.env.get("CORREIOS_ID")}:${Deno.env.get("CORREIOS_SENHA_API")}`,
  );
  const body: any = { numero: Deno.env.get("CORREIOS_CONTRATO") };
  const dr = Deno.env.get("CORREIOS_DR");
  if (dr) body.dr = Number(dr);

  const resp = await fetch(`${BASE_URL}/token/v1/autentica/contrato`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Token contrato (${resp.status}): ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt);
  await supabase.from("correios_token").upsert({
    id: "contrato",
    token: json.token,
    expira_em: json.expiraEm,
    ambiente: AMBIENTE,
    atualizado_em: new Date().toISOString(),
  });
  return json.token;
}

function brDate(diasAtras: number): string {
  const d = new Date(Date.now() - diasAtras * 86400000);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqBody = await req.json().catch(() => ({}));
    const modo = reqBody?.modo === "previa" ? "previa" : "faturas";
    const dias = Number(reqBody?.dias) > 0 ? Number(reqBody.dias) : 365;

    const token = await getTokenContrato();
    const contrato = Deno.env.get("CORREIOS_CONTRATO");
    const dr = Deno.env.get("CORREIOS_DR");

    let url: string;
    if (modo === "previa") {
      // Ciclo aberto — registros a faturar.
      url = `${BASE_URL}/faturas/v1/previas?contrato=${contrato}&dr=${dr}`;
    } else {
      url = `${BASE_URL}/faturas/v1/faturas?contrato=${contrato}&dr=${dr}&dataInicial=${brDate(dias)}&dataFinal=${brDate(0)}`;
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const bodyText = await resp.text();
    console.log(`${modo.toUpperCase()} status=${resp.status} body=${bodyText.slice(0, 1500)}`);

    return new Response(
      JSON.stringify({
        tokenOk: true,
        modo,
        status: resp.status,
        url,
        body: bodyText.slice(0, 6000),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
