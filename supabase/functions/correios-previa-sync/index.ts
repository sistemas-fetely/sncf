import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AMBIENTE = (Deno.env.get("CORREIOS_AMBIENTE") ?? "PRODUCAO").toUpperCase();
const BASE_URL =
  AMBIENTE === "HOMOLOGACAO" ? "https://apihom.correios.com.br" : "https://api.correios.com.br";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getTokenContrato(): Promise<string> {
  const { data: cached } = await supabase
    .from("correios_token").select("token, expira_em").eq("id", "contrato").maybeSingle();
  const bufferMs = 5 * 60 * 1000;
  if (cached && new Date(cached.expira_em).getTime() - bufferMs > Date.now()) return cached.token;

  const basic = btoa(`${Deno.env.get("CORREIOS_ID")}:${Deno.env.get("CORREIOS_SENHA_API")}`);
  const body: any = { numero: Deno.env.get("CORREIOS_CONTRATO") };
  const dr = Deno.env.get("CORREIOS_DR");
  if (dr) body.dr = Number(dr);
  const resp = await fetch(`${BASE_URL}/token/v1/autentica/contrato`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`Token contrato (${resp.status}): ${txt.slice(0, 300)}`);
  const json = JSON.parse(txt);
  await supabase.from("correios_token").upsert({
    id: "contrato", token: json.token, expira_em: json.expiraEm,
    ambiente: AMBIENTE, atualizado_em: new Date().toISOString(),
  });
  return json.token;
}

function toNum(s: string): number | null {
  if (s == null) return null;
  const v = parseFloat(String(s).trim().replace(/\./g, "").replace(",", "."));
  return isNaN(v) ? null : v;
}
function toInt(s: string): number | null {
  const v = parseInt(String(s ?? "").trim(), 10);
  return isNaN(v) ? null : v;
}

function parseAnalitico(csv: string) {
  const linhas = csv.split(/\r?\n/);
  const hIdx = linhas.findIndex((l) => l.includes("ETIQUETA") && l.includes("CODIGO DO SERVICO"));
  if (hIdx === -1) return { rows: [], rodape: null };

  const cols = linhas[hIdx].split(";").map((c) => c.trim());
  const at = (name: string) => cols.indexOf(name);
  const I = {
    centro: at("CODIGO DO CENTRO CUSTO"),
    cartao: at("CARTAO DE POSTAGEM"),
    data: at("DATA DE POSTAGEM"),
    codServ: at("CODIGO DO SERVICO"),
    descServ: at("DESCRICAO DO SERVICO"),
    qtd: at("QUANTIDADE DE ITENS"),
    peso: at("PESO"),
    vUnit: at("VALOR UNITARIO DO SERVICO"),
    vServ: at("VALOR DO SERVICO"),
    doc: at("NUMERO DO DOCUMENTO"),
    etiqueta: at("ETIQUETA"),
    vDecl: at("VALOR DECLARADO"),
    vDesc: at("VALOR DO DESCONTO"),
    cepO: at("CEP DE ORIGEM"),
    munO: at("MUNICIPIO DE ORIGEM"),
    ufO: at("UF DE ORIGEM"),
    cepD: at("CEP DE DESTINO"),
    munD: at("MUNICIPIO DE DESTINO"),
    ufD: at("UF DE DESTINO"),
  };

  const limpa = (x: string) => (x ?? "").trim().replace(/^"|"$/g, "").trim();
  const rows: any[] = [];
  for (let i = hIdx + 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) break;
    const c = linhas[i].split(";").map(limpa);
    const etiqueta = c[I.etiqueta];
    if (!etiqueta || !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(etiqueta)) continue;
    rows.push({
      etiqueta,
      origem_dado: "previa",
      centro_custo: c[I.centro] || null,
      cartao_postagem: c[I.cartao] || null,
      data_postagem: c[I.data] || null,
      codigo_servico: c[I.codServ] || null,
      descricao_servico: c[I.descServ] || null,
      quantidade_itens: toInt(c[I.qtd]),
      peso: toInt(c[I.peso]),
      valor_unitario: toNum(c[I.vUnit]),
      valor_servico: toNum(c[I.vServ]),
      valor_declarado: toNum(c[I.vDecl]),
      valor_desconto: toNum(c[I.vDesc]),
      numero_documento: c[I.doc] || null,
      cep_origem: c[I.cepO] || null,
      municipio_origem: c[I.munO] || null,
      uf_origem: c[I.ufO] || null,
      cep_destino: c[I.cepD] || null,
      municipio_destino: c[I.munD] || null,
      uf_destino: c[I.ufD] || null,
      atualizado_em: new Date().toISOString(),
    });
  }

  let rodape: { qtd: number | null; total: number | null } | null = null;
  const rIdx = linhas.findIndex((l) => l.startsWith("NUMERO DO CARTAO DE POSTAGEM"));
  if (rIdx !== -1 && linhas[rIdx + 1]) {
    const r = linhas[rIdx + 1].split(";").map((x) => x.trim());
    rodape = { qtd: toInt(r[1]), total: toNum(r[2]) };
  }
  return { rows, rodape };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = await getTokenContrato();
    const contrato = Deno.env.get("CORREIOS_CONTRATO");
    const dr = Deno.env.get("CORREIOS_DR");
    const auth = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const postUrl = `${BASE_URL}/faturas/v1/previas?contrato=${contrato}&dr=${dr}&tipoPrevia=ANALITICO`;
    const postResp = await fetch(postUrl, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    const postText = await postResp.text();
    if (!postResp.ok) {
      return new Response(JSON.stringify({ etapa: "POST /previas", status: postResp.status, body: postText.slice(0, 2000) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const idProc = JSON.parse(postText)?.id ?? JSON.parse(postText)?.idProcessamento;

    let statusProc = "SOLICITADO", tentativas = 0;
    while (tentativas < 15 && !["SUCESSO", "ERRO", "FALHA", "CANCELADO"].includes(statusProc)) {
      await sleep(2500);
      const pr = await fetch(`${BASE_URL}/faturas/v1/processamentos/${idProc}`, { headers: auth });
      try { statusProc = JSON.parse(await pr.text())?.status ?? statusProc; } catch { /* */ }
      tentativas++;
    }
    if (statusProc !== "SUCESSO") {
      return new Response(JSON.stringify({ etapa: "processamento", statusProc, tentativas, idProc }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const fr = await fetch(`${BASE_URL}/faturas/v1/processamentos/${idProc}/file`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const csv = await fr.text();

    const { rows, rodape } = parseAnalitico(csv);
    for (const r of rows) (r as any).contrato = contrato;

    let upserted = 0;
    if (rows.length > 0) {
      const { error } = await supabase
        .from("correios_lancamentos")
        .upsert(rows, { onConflict: "etiqueta" });
      if (error) throw new Error(`upsert: ${error.message}`);
      upserted = rows.length;
    }

    const somaParse = rows.reduce((s, r) => s + (r.valor_servico ?? 0), 0);

    return new Response(JSON.stringify({
      ok: true,
      lancamentos: rows.length,
      upserted,
      somaValorServico: Math.round(somaParse * 100) / 100,
      rodape,
      confere: rodape?.total != null ? Math.abs((rodape.total ?? 0) - somaParse) < 0.05 : null,
      exemplo: rows[0] ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
