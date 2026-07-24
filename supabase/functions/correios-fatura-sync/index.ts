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
  const body: Record<string, unknown> = { numero: Deno.env.get("CORREIOS_CONTRATO") };
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
function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

function parseAnaliticoFatura(csv: string) {
  const linhas = csv.split(/\r?\n/);
  const hIdx = linhas.findIndex((l) => l.includes("ETIQUETA") && l.includes("CARTAO POSTAGEM"));
  if (hIdx === -1) return { rows: [] as Record<string, unknown>[], totalRodape: null as number | null };

  const cols = linhas[hIdx].split(";").map((c) => c.trim());
  const at = (name: string) => cols.indexOf(name);
  const I = {
    cartao: at("CARTAO POSTAGEM"), codServ: at("CODIGO SERVICO"), servico: at("SERVICO"),
    data: at("DATA POSTAGEM"), cepD: at("CEP DESTINATARIO"), etiqueta: at("ETIQUETA"),
    doc: at("DOCUMENTO"), peso: at("PESO"), vUnit: at("VALOR UNITARIO"),
    vDesc: at("DESCONTO"), qtd: at("QUANTIDADE"), vLiq: at("VALOR LIQUIDO"),
    vDecl: at("VALOR DECLARADO"),
  };

  const limpa = (x: string) => (x ?? "").trim().replace(/^"|"$/g, "").trim();
  const rows: Record<string, unknown>[] = [];
  for (let i = hIdx + 1; i < linhas.length; i++) {
    if (!linhas[i].trim()) break;
    const c = linhas[i].split(";").map(limpa);
    const etiqueta = c[I.etiqueta];
    if (!etiqueta || !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(etiqueta)) continue;
    rows.push({
      etiqueta, origem_dado: "fatura",
      cartao_postagem: c[I.cartao] || null,
      codigo_servico: c[I.codServ] || null,
      descricao_servico: c[I.servico] || null,
      data_postagem: c[I.data] || null,
      cep_destino: c[I.cepD] || null,
      numero_documento: c[I.doc] || null,
      peso: toInt(c[I.peso]),
      valor_unitario: toNum(c[I.vUnit]),
      valor_desconto: toNum(c[I.vDesc]),
      quantidade_itens: toInt(c[I.qtd]),
      valor_servico: toNum(c[I.vLiq]),
      valor_declarado: toNum(c[I.vDecl]),
      empresa_frete: "correios",
      atualizado_em: new Date().toISOString(),
    });
  }

  let totalRodape: number | null = null;
  const tIdx = linhas.findIndex((l) => l.startsWith("Total da Fatura"));
  if (tIdx !== -1) totalRodape = toNum(linhas[tIdx].split(";")[2]);
  return { rows, totalRodape };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* body vazio ok */ }

    const token = await getTokenContrato();
    const contrato = Deno.env.get("CORREIOS_CONTRATO");
    const dr = Number(Deno.env.get("CORREIOS_DR") ?? "72");
    const auth = { Authorization: `Bearer ${token}`, Accept: "application/json" };

    const hoje = new Date();
    const inicioDefault = new Date(hoje.getTime() - 60 * 24 * 60 * 60 * 1000);
    const dataInicial = (body.dataInicial as string) ?? ddmmyyyy(inicioDefault);
    const dataFinal = (body.dataFinal as string) ?? ddmmyyyy(hoje);
    const force = body.force === true;

    const listResp = await fetch(
      `${BASE_URL}/faturas/v1/faturas?contrato=${contrato}&dr=${dr}&dataInicial=${dataInicial}&dataFinal=${dataFinal}`,
      { headers: auth },
    );
    const listText = await listResp.text();
    if (!listResp.ok) {
      return new Response(JSON.stringify({ etapa: "GET /faturas", status: listResp.status, body: listText.slice(0, 1000) }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const faturas: Record<string, unknown>[] = JSON.parse(listText) ?? [];

    const resultados: Record<string, unknown>[] = [];
    for (const f of faturas) {
      const faturaId = Number(f.id);
      const tipoDocumento = String(f.tipoDocumento ?? "RE");
      const drFatura = String(f.drFatura ?? "").padStart(5, "0");
      const itemFatura = String(f.itemFatura ?? "001");

      if (!force) {
        const { data: ja } = await supabase
          .from("correios_faturas_arquivos").select("fatura_id").eq("fatura_id", faturaId).maybeSingle();
        if (ja) { resultados.push({ faturaId, status: "ja_importada" }); continue; }
      }

      const solResp = await fetch(
        `${BASE_URL}/faturas/v1/faturas/${faturaId}/analitico?tipoDocumento=${tipoDocumento}&drFatura=${drFatura}&itemFatura=${itemFatura}`,
        { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({}) },
      );
      const solText = await solResp.text();
      if (!solResp.ok) { resultados.push({ faturaId, etapa: "POST analitico", status: solResp.status, body: solText.slice(0, 500) }); continue; }
      const idProc = JSON.parse(solText)?.id;

      let statusProc = "SOLICITADO", tentativas = 0;
      while (tentativas < 15 && !["SUCESSO", "ERRO", "FALHA", "CANCELADO"].includes(statusProc)) {
        await sleep(2500);
        const pr = await fetch(`${BASE_URL}/faturas/v1/processamentos/${idProc}`, { headers: auth });
        try { statusProc = JSON.parse(await pr.text())?.status ?? statusProc; } catch { /* */ }
        tentativas++;
      }
      if (statusProc !== "SUCESSO") { resultados.push({ faturaId, etapa: "processamento", statusProc }); continue; }

      const fr = await fetch(`${BASE_URL}/faturas/v1/processamentos/${idProc}/file`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const csv = await fr.text();

      const { rows, totalRodape } = parseAnaliticoFatura(csv);
      for (const r of rows) (r as Record<string, unknown>).contrato = contrato;

      const { error: errArq } = await supabase.from("correios_faturas_arquivos").upsert({
        fatura_id: faturaId,
        data_fechamento: f.dataFechamento ?? null,
        vencimento: f.vencimento ?? null,
        valor_total: f.valor ?? null,
        csv_analitico: csv,
        baixado_em: new Date().toISOString(),
      }, { onConflict: "fatura_id" });
      if (errArq) { resultados.push({ faturaId, etapa: "persistir csv", erro: errArq.message }); continue; }

      let upserted = 0;
      if (rows.length > 0) {
        const { error } = await supabase.from("correios_lancamentos").upsert(rows, { onConflict: "etiqueta" });
        if (error) { resultados.push({ faturaId, etapa: "upsert lancamentos", erro: error.message }); continue; }
        upserted = rows.length;
      }

      let semeados = 0;
      if (rows.length > 0) {
        const novos = rows.map((r) => ({
          codigo_rastreio: r.etiqueta,
          servico: r.descricao_servico,
          entregue: false,
        }));
        const { data: ins, error: errSeed } = await supabase
          .from("pedido_rastreamento")
          .upsert(novos, { onConflict: "codigo_rastreio", ignoreDuplicates: true })
          .select("id");
        if (errSeed) console.log("seed rastreamento erro:", errSeed.message);
        else semeados = ins?.length ?? 0;
      }

      const soma = rows.reduce((s, r) => s + ((r.valor_servico as number) ?? 0), 0);
      resultados.push({
        faturaId, objetos: rows.length, upserted, rastreamentoSemeados: semeados,
        soma: Math.round(soma * 100) / 100, totalRodape,
        confere: totalRodape != null ? Math.abs(totalRodape - soma) < 0.05 : null,
      });
    }

    return new Response(JSON.stringify({ ok: true, periodo: { dataInicial, dataFinal }, faturas: resultados }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ erro: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
