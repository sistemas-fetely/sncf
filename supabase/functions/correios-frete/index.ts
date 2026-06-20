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

// Serviços padrão de contrato. AJUSTE para os códigos do SEU contrato.
const SERVICOS_PADRAO = [
  { coProduto: "03220", nome: "SEDEX" },
  { coProduto: "03298", nome: "PAC" },
];

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

  const id = Deno.env.get("CORREIOS_ID")!;
  const senha = Deno.env.get("CORREIOS_SENHA_API")!;
  const cartao = Deno.env.get("CORREIOS_CARTAO")!;
  const basic = btoa(`${id}:${senha}`);

  const resp = await fetch(`${BASE_URL}/token/v1/autentica/cartaopostagem`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ numero: cartao }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Falha ao gerar token (${resp.status}): ${txt}`);
  }

  const json = await resp.json();
  const token: string = json.token;
  const expiraEm: string = json.expiraEm;

  await supabase.from("correios_token").upsert({
    id: "singleton",
    token,
    expira_em: expiraEm,
    ambiente: AMBIENTE,
    atualizado_em: new Date().toISOString(),
  });

  return token;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function hojeBR(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      cepDestino,
      cepOrigem = Deno.env.get("CEP_ORIGEM_PADRAO"),
      peso,
      comprimento,
      largura,
      altura,
      tpObjeto = "2",
      vlDeclarado,
      servicos = SERVICOS_PADRAO,
    } = body ?? {};

    if (!cepDestino || !cepOrigem || !peso) {
      return new Response(
        JSON.stringify({
          erro: "Campos obrigatórios: cepDestino, cepOrigem (ou CEP_ORIGEM_PADRAO), peso (g).",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await getToken();
    const drEnv = Deno.env.get("CORREIOS_DR");
    const nuDR = drEnv ? Number(drEnv) : undefined;

    const limpa = (c: string) => String(c).replace(/\D/g, "");
    const cepO = limpa(cepOrigem);
    const cepD = limpa(cepDestino);

    const parametrosProduto = servicos.map((s: { coProduto: string }) => ({
      coProduto: s.coProduto,
      nuRequisicao: s.coProduto,
      ...(nuDR != null ? { nuDR } : {}),
      cepOrigem: cepO,
      cepDestino: cepD,
      psObjeto: String(peso),
      tpObjeto: String(tpObjeto),
      comprimento: String(comprimento ?? 20),
      largura: String(largura ?? 20),
      altura: String(altura ?? 20),
      ...(vlDeclarado
        ? {
            vlDeclarado: String(vlDeclarado),
            servicosAdicionais: [{ coServAdicional: "019" }],
          }
        : {}),
    }));

    const parametrosPrazo = servicos.map((s: { coProduto: string }) => ({
      coProduto: s.coProduto,
      nuRequisicao: s.coProduto,
      dtEvento: hojeBR(),
      cepOrigem: cepO,
      cepDestino: cepD,
      dataPostagem: hojeISO(),
    }));

    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    const [precoResp, prazoResp] = await Promise.all([
      fetch(`${BASE_URL}/preco/v1/nacional`, {
        method: "POST",
        headers,
        body: JSON.stringify({ idLote: "1", parametrosProduto }),
      }),
      fetch(`${BASE_URL}/prazo/v1/nacional`, {
        method: "POST",
        headers,
        body: JSON.stringify({ idLote: "1", parametrosPrazo }),
      }),
    ]);

    const precos = precoResp.ok ? await precoResp.json() : [];
    const prazos = prazoResp.ok ? await prazoResp.json() : [];

    const arr = (x: unknown) => (Array.isArray(x) ? x : []);
    const precoArr = arr(precos);
    const prazoArr = arr(prazos);

    const resultado = servicos.map((s: { coProduto: string; nome: string }) => {
      const p = precoArr.find((x: any) => x.coProduto === s.coProduto);
      const z = prazoArr.find((x: any) => x.coProduto === s.coProduto);

      const precoStr =
        p?.pcFinal ?? p?.pcReferencia ?? p?.pcBaseGeral ?? p?.pcBase ?? null;
      const preco =
        precoStr != null ? Number(String(precoStr).replace(",", ".")) : null;

      return {
        coProduto: s.coProduto,
        nome: s.nome,
        preco,
        prazo: z?.prazoEntrega != null ? Number(z.prazoEntrega) : null,
        erro: p?.txErro ?? p?.msgErro ?? z?.txErro ?? null,
      };
    });

    return new Response(
      JSON.stringify({ cepOrigem: cepO, cepDestino: cepD, resultado }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
