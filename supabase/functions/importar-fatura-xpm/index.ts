// importar-fatura-xpm — F1 Faturamento XPM (29/10/2026)
// Ingestão da planilha mensal "NN. Faturamento FETELY - MES AAAA[_R02].xlsm".
// Dois modos:
//   e-mail : { resend_email_id } + header x-internal-key (chamado por receber-fases-xpm-email)
//   upload : { storage_path } + JWT de usuário (arquivo já está no bucket xpm-faturas)
// Fail-loud: sem RESUMO-FATURA -> xpm_fatura status 'erro_leitura' com o motivo.
// Idempotente por competência+versão: reprocessar apaga linhas/detalhe e regrava.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const BUCKET = "xpm-faturas";
const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// latin-1 lido como utf-8 ("ConferÃªncia") -> utf-8
function fixEnc(s: string): string {
  if (!/[ÃÂ]/.test(s)) return s;
  try { return decodeURIComponent(escape(s)); } catch { return s; }
}
function norm(v: unknown): string {
  return fixEnc(String(v ?? "")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function slug(s: string): string {
  return norm(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "sem_nome";
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v).replace(/[R$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isFinite(n) ? n : null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS cellDates cria Date em horário local do runtime (UTC no Deno); somar 12h evita virar o dia
    const d = new Date(v.getTime() + 12 * 3600e3);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}
const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

function competenciaDe(texto: string): string | null {
  const t = norm(texto);
  for (const [mes, n] of Object.entries(MESES)) {
    const m = t.match(new RegExp(`${mes}[^0-9]{0,5}(20\\d{2})`));
    if (m) return `${m[1]}-${String(n).padStart(2, "0")}-01`;
  }
  return null;
}
function versaoDoNome(nome: string): number | null {
  const m = nome.match(/R0?(\d+)(?=\D*\.xls[xm]?$|[_\s.-]|$)/i);
  return m ? Number(m[1]) : null;
}

// ---------- mapeamento texto -> chave ----------
function mapearServico(desc: string, processo: string): string | null {
  const d = norm(desc);
  const p = norm(processo);
  if (d.includes("unidades recebidas")) return "receb_unid";
  if (d.includes("container") && d.includes("40")) return "receb_cont40";
  if (d.includes("container") && d.includes("20")) {
    if (p.includes("extra")) return "cont20_extra";
    return "receb_cont20";
  }
  if (d.includes("etiquetagem")) return "adeq_etiq";
  if (d.includes("montagem kit")) return "adeq_kit";
  if (d.includes("fulfillment")) return "adeq_full";
  if (d.includes("porta pallet")) {
    if (d.includes("1,60") || d.includes("160")) return "arm_pp_160";
    if (d.includes("154")) return "arm_pp_154";
    if (d.includes("1,00") || d.includes("104")) return "arm_pp_104";
  }
  if (/\bbin/.test(d) && d.includes("4x")) return "arm_bin4x";
  if (/\bbin/.test(d) && d.includes("1x")) return "arm_bin1x";
  if (d.includes("ate 10.000")) return "exp_f1";
  if (d.includes("ate 20.000")) return "exp_f2";
  if (d.includes("30.000")) return "exp_f3";
  if (d.includes("nf de entrada")) return "seguro";
  if (d.includes("endereco virtual")) return "end_virtual";
  if (d.includes("dias uteis")) return "he_util";
  if (d.includes("fins de semana")) return "he_fds";
  if (d === "adequacao") return "adeq_extra";
  if (d.includes("insumos")) return "insumos";
  if (d.includes("descarga pallet")) return "desc_pallet";
  if (d.includes("descarga volumes")) return "desc_vol";
  if (d.includes("emergenciais")) return "ped_emerg";
  if (d.includes("somente quando")) return "pos_extra";
  return null;
}

type Linha = {
  servico_chave: string; descricao_original: string; uom_original: string | null;
  qtde_cobrada: number | null; preco_cobrado: number | null; valor_cobrado: number;
  ordem: number; status: string; nota: string | null; _processo: string;
};

// deno-lint-ignore no-explicit-any
type Row = any[];

function lerResumo(rows: Row[]) {
  // cabeçalho: linha com "processo" e "descri"
  let h = -1;
  let col = { proc: 0, desc: 1, uom: 2, qtde: 3, preco: 4, total: 5 };
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cs = (rows[i] ?? []).map(norm);
    const ip = cs.findIndex((c) => c === "processo");
    const id = cs.findIndex((c) => c.startsWith("descri"));
    if (ip >= 0 && id >= 0) {
      h = i;
      const f = (re: RegExp, d: number) => { const k = cs.findIndex((c) => re.test(c)); return k >= 0 ? k : d; };
      col = {
        proc: ip, desc: id,
        uom: f(/^uom|unidade/, id + 1),
        qtde: f(/^qt/, id + 2),
        preco: f(/unitario/, id + 3),
        total: f(/preco total|valor total|^total/, id + 4),
      };
      break;
    }
  }
  if (h < 0) throw new Error('Cabeçalho "Processo | Descrição" não encontrado na aba RESUMO-FATURA.');

  const ultimoNum = (r: Row) => { for (let k = r.length - 1; k >= 0; k--) { const n = num(r[k]); if (n !== null) return n; } return null; };
  const linhas: Omit<Linha, "servico_chave" | "status" | "nota">[] = [];
  const tot: Record<string, number | null> = {};
  let simulado = false;
  let processo = "";
  let fimServicos = false;
  let blocoMinimo = false;
  let ordem = 0;
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const textos = r.map(norm).filter(Boolean);
    const rotulo = textos.find((t) => /[a-z]/.test(t) && num(t) === null) ?? "";
    if (rotulo.includes("composicao do minimo")) { blocoMinimo = true; fimServicos = true; continue; }
    if (blocoMinimo) {
      if (rotulo.startsWith("valor fixo")) tot.minimo_fixo = ultimoNum(r);
      else if (rotulo === "total" || rotulo.startsWith("total")) tot.valor_minimo = ultimoNum(r);
      continue;
    }
    if (rotulo.startsWith("simulado total")) { simulado = true; tot.valor_total = ultimoNum(r); fimServicos = true; continue; }
    if (rotulo.startsWith("valor total")) { tot.valor_total = ultimoNum(r); fimServicos = true; continue; }
    if (rotulo.startsWith("valor a faturar")) { tot.valor_faturar = ultimoNum(r); fimServicos = true; continue; }
    if (rotulo.startsWith("desconto")) { tot.valor_desconto = ultimoNum(r); fimServicos = true; continue; }
    if (fimServicos) continue;
    if (textos.some((t) => t.startsWith("sub-total") || t.startsWith("subtotal") || t.startsWith("sub total"))) continue;
    if (!vazio(r[col.proc])) processo = fixEnc(String(r[col.proc])).trim();
    const desc = vazio(r[col.desc]) ? "" : fixEnc(String(r[col.desc])).trim();
    if (!desc) continue;
    linhas.push({
      descricao_original: desc,
      uom_original: vazio(r[col.uom]) ? null : fixEnc(String(r[col.uom])).trim(),
      qtde_cobrada: num(r[col.qtde]),
      preco_cobrado: num(r[col.preco]),
      valor_cobrado: r2(num(r[col.total]) ?? 0),
      ordem: ordem++,
      _processo: processo,
    });
  }
  return { linhas, tot, simulado };
}

// ---------- detalhe ----------
const ABAS_DETALHE: { nome: string; aba: string }[] = [
  { nome: "expedicao", aba: "exp" }, { nome: "recebimento", aba: "rec" },
  { nome: "valor do estoque", aba: "vest" }, { nome: "descarga", aba: "desc" },
  { nome: "insumos", aba: "ins" }, { nome: "he", aba: "he" },
  { nome: "pedidos urgente", aba: "urg" }, { nome: "adequacao", aba: "adeq" },
];
type Det = { aba: string; linha_n: number; data: string | null; pedido_ref: string | null; nf: string | null; sku_xpm: string | null; qtde: number | null; valor: number | null; dados: Record<string, unknown> };

function achaAba(wb: XLSX.WorkBook, alvo: string): string | null {
  return wb.SheetNames.find((n) => norm(n) === alvo) ?? null;
}
function rowsDe(ws: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Row[];
}
const jsonVal = (v: unknown) => (v instanceof Date ? toDate(v) : v);

function lerTabela(rows: Row[], aba: string): Det[] {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const n = (rows[i] ?? []).filter((c) => typeof c === "string" && c.trim() && num(c) === null).length;
    if (n >= 2) { h = i; break; }
  }
  if (h < 0) return [];
  const heads = (rows[h] ?? []).map((c) => (vazio(c) ? "" : fixEnc(String(c)).trim()));
  const nh = heads.map(norm);
  const idx = (...alvos: string[]) => { for (const a of alvos) { const k = nh.findIndex((x) => x === a); if (k >= 0) return k; } for (const a of alvos) { const k = nh.findIndex((x) => x.includes(a)); if (k >= 0) return k; } return -1; };
  const c: Record<string, number> = {};
  if (aba === "exp") Object.assign(c, { data: idx("cadastrada em"), pedido_ref: idx("pedido de venda"), nf: idx("nota fiscal"), sku: idx("codigo produto depositante"), qtde: idx("qtde. atendida"), valor: idx("valor total da nf") });
  else if (aba === "rec") Object.assign(c, { data: idx("data da conferencia"), nf: idx("nota fiscal"), sku: idx("codigo do produto"), qtde: idx("quantidade") });
  else if (aba === "vest") Object.assign(c, { data: idx("data"), valor: idx("valor") });
  else if (aba === "desc") Object.assign(c, { data: idx("data"), nf: idx("nota fiscal", "nf") });
  else if (aba === "ins") Object.assign(c, { qtde: idx("qtde", "quantidade"), valor: idx("total") });
  else Object.assign(c, { data: idx("data"), qtde: idx("qtde", "quantidade"), valor: idx("valor total", "total", "valor") });
  const g = (r: Row, k: string) => (c[k] !== undefined && c[k] >= 0 ? r[c[k]] : null);
  const out: Det[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const dados: Record<string, unknown> = {};
    let util = false;
    heads.forEach((hd, k) => {
      if (!hd || nh[k] === "depositante" || nh[k] === "produto") return;
      const v = r[k];
      if (vazio(v)) return;
      dados[hd] = jsonVal(v);
      if (num(v) !== 0) util = true;
    });
    if (!util) continue;
    const nf = g(r, "nf");
    out.push({
      aba, linha_n: i + 1, data: toDate(g(r, "data")),
      pedido_ref: vazio(g(r, "pedido_ref")) ? null : String(g(r, "pedido_ref")),
      nf: vazio(nf) ? null : (num(nf) !== null ? String(Math.trunc(num(nf)!)) : String(nf).replace(/\.0+$/, "")),
      sku_xpm: vazio(g(r, "sku")) ? null : String(g(r, "sku")).trim(),
      qtde: num(g(r, "qtde")), valor: num(g(r, "valor")), dados,
    });
  }
  return out;
}

// Ocupação: 5 blocos lado a lado (um por tipo de posição), uma linha por dia.
function lerOcupacao(rows: Row[], avisos: string[]): Det[] {
  let h = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) if ((rows[i] ?? []).some((c) => norm(c) === "data")) { h = i; break; }
  if (h < 0) { avisos.push("Ocupação: cabeçalho com 'Data' não encontrado — aba ignorada."); return []; }
  const nh = (rows[h] ?? []).map(norm);
  const titulos = (rows[h - 1] ?? []).map((c) => (vazio(c) ? "" : fixEnc(String(c)).trim()));
  const colData = nh.findIndex((x) => x === "data");
  const blocos: { tipo: string; q: number; t: number; v: number }[] = [];
  nh.forEach((x, k) => {
    if (!/^(qtde|quantidade|qtd)/.test(x)) return;
    let tipo = "";
    for (let j = k; j >= 0 && !tipo; j--) tipo = titulos[j] ?? "";
    const t = nh.findIndex((y, j) => j > k && j <= k + 3 && /tarifa|preco/.test(y));
    const v = nh.findIndex((y, j) => j > k && j <= k + 3 && /valor|total/.test(y));
    blocos.push({ tipo: tipo || `bloco_${blocos.length + 1}`, q: k, t, v });
  });
  if (!blocos.length) { avisos.push("Ocupação: blocos de quantidade não encontrados — aba ignorada."); return []; }
  if (blocos.length !== 5) avisos.push(`Ocupação: esperados 5 blocos, encontrados ${blocos.length}.`);
  const out: Det[] = [];
  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const data = toDate(r[colData]);
    if (!data) continue;
    const dados: Record<string, unknown> = {};
    let util = false;
    for (const b of blocos) {
      const q = num(r[b.q]), t = b.t >= 0 ? num(r[b.t]) : null, v = b.v >= 0 ? num(r[b.v]) : null;
      if (q || v) util = true;
      dados[b.tipo] = { qtde: q, tarifa: t, valor: v };
    }
    if (!util) continue;
    out.push({ aba: "ocu", linha_n: i + 1, data, pedido_ref: null, nf: null, sku_xpm: null, qtde: null, valor: null, dados });
  }
  return out;
}

// ---------- principal ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "método" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const emailId = typeof body?.resend_email_id === "string" ? body.resend_email_id.trim() : "";
  const storagePathIn = typeof body?.storage_path === "string" ? body.storage_path.trim() : "";
  if (!emailId && !storagePathIn) return json({ error: "Informe resend_email_id ou storage_path." }, 400);

  const avisos: string[] = [];
  let origem: "email" | "upload";
  let arquivoNome = "";
  let storagePath = "";
  let assunto = "";
  let bytes: Uint8Array;

  try {
    if (emailId) {
      origem = "email";
      const { data: ik } = await sb.rpc("get_vault_secret", { p_name: "INTERNAL_EDGE_KEY" });
      const { data: rk } = await sb.rpc("get_vault_secret", { p_name: "resend_api_key" });
      const chaveInterna = String(ik ?? "") || String(rk ?? "");
      if (!chaveInterna || req.headers.get("x-internal-key") !== chaveInterna) return json({ error: "Unauthorized" }, 401);
      const auth = { Authorization: `Bearer ${rk}` };
      const re = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, { headers: auth });
      if (!re.ok) throw new Error(`Resend GET e-mail ${re.status}: ${(await re.text()).slice(0, 300)}`);
      const email = await re.json();
      assunto = String(email?.subject ?? "");
      const ra = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, { headers: auth });
      const rawTxt = await ra.text();
      if (!ra.ok) throw new Error(`Resend GET anexos ${ra.status}: ${rawTxt.slice(0, 500)}`);
      // deno-lint-ignore no-explicit-any
      let lista: any[] | null = null;
      try { const j = JSON.parse(rawTxt); lista = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : null; } catch { /* abaixo */ }
      // deno-lint-ignore no-explicit-any
      const anexo = lista?.find((a: any) => /\.xls[xm]$/i.test(String(a?.filename ?? "")));
      if (!lista || (anexo && !anexo.download_url)) {
        return await gravarErro(sb, { competencia: competenciaDe(assunto), origem, resend_email_id: emailId, arquivo_nome: null, storage_path: null, erro: `Formato inesperado da lista de anexos do Resend: ${rawTxt.slice(0, 3000)}` });
      }
      if (!anexo) {
        return await gravarErro(sb, { competencia: competenciaDe(assunto), origem, resend_email_id: emailId, arquivo_nome: null, storage_path: null, erro: `E-mail sem anexo .xlsm/.xlsx (anexos: ${lista.map((a) => a?.filename).join(", ") || "nenhum"}).` });
      }
      arquivoNome = String(anexo.filename);
      const rd = await fetch(String(anexo.download_url));
      if (!rd.ok) throw new Error(`Download do anexo ${rd.status}`);
      bytes = new Uint8Array(await rd.arrayBuffer());
    } else {
      origem = "upload";
      const authH = req.headers.get("Authorization") ?? "";
      if (!authH.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const { data: u, error: ue } = await sb.auth.getUser(authH.replace("Bearer ", ""));
      if (ue || !u?.user) return json({ error: "Unauthorized" }, 401);
      storagePath = storagePathIn;
      arquivoNome = storagePath.split("/").pop()!.replace(/^\d{10,}-/, "");
      const { data: blob, error: de } = await sb.storage.from(BUCKET).download(storagePath);
      if (de || !blob) throw new Error(`Arquivo não encontrado no storage (${storagePath}): ${de?.message ?? ""}`);
      bytes = new Uint8Array(await blob.arrayBuffer());
    }

    const competencia = competenciaDe(arquivoNome) ?? competenciaDe(assunto);
    if (!competencia) return json({ error: `Não consegui ler a competência do nome do arquivo "${arquivoNome}"${assunto ? ` nem do assunto "${assunto}"` : ""}.` }, 422);

    // versão — decidida pelo conteúdo (SHA-256), não pelo nome do arquivo.
    // (a) mesmo hash de uma versão existente → reprocessa essa versão (idempotente)
    // (c) R0N no nome → versão N (sobrescreve se já existir, mesmo com hash diferente)
    // (b) demais casos → max(versao)+1; anteriores viram substituídas
    // O hash não é gravado: comparamos com o arquivo já salvo no storage de cada versão.
    const { data: existentes, error: ee } = await sb.from("xpm_fatura").select("id, versao, arquivo_nome, storage_path").eq("competencia", competencia);
    if (ee) throw new Error(`xpm_fatura: ${ee.message}`);
    const vNome = versaoDoNome(arquivoNome);
    const hashNovo = await sha256Hex(bytes);
    let versaoMesmoHash: number | null = null;
    for (const f of [...(existentes ?? [])].sort((a, b) => b.versao - a.versao)) {
      const caminho = f.storage_path || `${competencia.slice(0, 7)}/v${f.versao}.xlsm`;
      if (origem === "upload" && caminho === storagePath) { versaoMesmoHash = f.versao; break; }
      const { data: blobAnt, error: be } = await sb.storage.from(BUCKET).download(caminho);
      if (be || !blobAnt) continue; // versão sem arquivo salvo (ex.: erro de leitura) não serve de comparação
      if ((await sha256Hex(new Uint8Array(await blobAnt.arrayBuffer()))) === hashNovo) { versaoMesmoHash = f.versao; break; }
    }
    const maxV = Math.max(0, ...(existentes ?? []).map((f) => f.versao));
    const versao = versaoMesmoHash ?? vNome ?? maxV + 1;

    if (origem === "email") {
      storagePath = `${competencia.slice(0, 7)}/v${versao}.xlsm`;
      const { error: se } = await sb.storage.from(BUCKET).upload(storagePath, bytes, { upsert: true, contentType: "application/vnd.ms-excel.sheet.macroEnabled.12" });
      if (se) throw new Error(`Upload no storage: ${se.message}`);
    }

    const wb = XLSX.read(bytes, { type: "array", cellDates: true });
    const abaResumo = wb.SheetNames.find((n) => norm(n) === "resumo-fatura");
    const base = { competencia, versao, origem, resend_email_id: emailId || null, arquivo_nome: arquivoNome, storage_path: storagePath };
    if (!abaResumo) {
      return await gravarErro(sb, { ...base, erro: `Aba RESUMO-FATURA não encontrada. Abas: ${wb.SheetNames.join(", ")}` });
    }
    let resumo;
    try { resumo = lerResumo(rowsDe(wb.Sheets[abaResumo])); }
    catch (e) { return await gravarErro(sb, { ...base, erro: (e as Error).message }); }
    if (!resumo.linhas.length) return await gravarErro(sb, { ...base, erro: "RESUMO-FATURA sem linhas de serviço." });
    if (resumo.tot.valor_total == null) return await gravarErro(sb, { ...base, erro: 'Linha "VALOR TOTAL"/"SIMULADO TOTAL" não encontrada.' });

    // mapeamento
    const { data: dims, error: dimE } = await sb.from("xpm_servico_dim").select("chave");
    if (dimE) throw new Error(`xpm_servico_dim: ${dimE.message}`);
    const conhecidas = new Set((dims ?? []).map((d) => d.chave));
    const observ: string[] = [];
    const linhas: Linha[] = [];
    for (const l of resumo.linhas) {
      let chave = mapearServico(l.descricao_original, l._processo);
      if (!chave) {
        chave = `novo_${slug(l.descricao_original)}`;
        if (!conhecidas.has(chave)) {
          const { error } = await sb.from("xpm_servico_dim").insert({ chave, processo: l._processo || "—", descricao: l.descricao_original, uom: l.uom_original, ativo: false, ordem: 900 });
          if (error) throw new Error(`Criar serviço novo ${chave}: ${error.message}`);
          conhecidas.add(chave);
        }
        observ.push(`serviço novo: ${l.descricao_original}`);
        avisos.push(`Serviço novo (não mapeado): ${l.descricao_original}`);
      }
      linhas.push({ ...l, servico_chave: chave, status: "pendente", nota: null });
    }
    // chave repetida -> ok pela unique (fatura, chave, ordem)

    const valorTotal = r2(resumo.tot.valor_total);
    const desconto = r2(Math.abs(resumo.tot.valor_desconto ?? 0));
    let valorFaturar = resumo.tot.valor_faturar ? r2(resumo.tot.valor_faturar) : r2(valorTotal - desconto);
    if (!valorFaturar) valorFaturar = r2(valorTotal - desconto);
    if (desconto > 0) {
      linhas.push({ servico_chave: "desconto", descricao_original: "Desconto", uom_original: null, qtde_cobrada: null, preco_cobrado: null, valor_cobrado: -desconto, ordem: 99, status: "pendente", nota: null, _processo: "" });
      if (!conhecidas.has("desconto")) avisos.push("Chave 'desconto' não existe em xpm_servico_dim — a gravação pode falhar.");
    }

    // regra "fora do total"
    const soma = () => r2(linhas.reduce((s, l) => s + l.valor_cobrado, 0));
    const dif = r2(soma() - valorFaturar);
    if (Math.abs(dif) > 0.05) {
      const cands = linhas.filter((l) => (l.servico_chave === "end_virtual" || l.servico_chave === "receb_cont40") && l.valor_cobrado > 0);
      const subsets: Linha[][] = [];
      for (let m = 1; m < 1 << cands.length; m++) subsets.push(cands.filter((_, i) => m & (1 << i)));
      const hit = subsets.find((s) => Math.abs(r2(s.reduce((a, l) => a + l.valor_cobrado, 0)) - dif) <= 0.05);
      if (hit) {
        for (const l of hit) { l.valor_cobrado = 0; l.status = "ok"; l.nota = "Listado na planilha mas fora do VALOR TOTAL (não cobrado neste mês)"; }
        avisos.push(`Linhas fora do total zeradas: ${hit.map((l) => l.servico_chave).join(", ")}`);
      } else {
        const msg = `Soma das linhas (${soma().toFixed(2)}) ≠ valor a faturar (${valorFaturar.toFixed(2)})`;
        observ.push(msg); avisos.push(msg);
      }
    }

    // detalhe
    const detalhe: Det[] = [];
    for (const a of ABAS_DETALHE) {
      const nome = achaAba(wb, a.nome);
      if (nome) detalhe.push(...lerTabela(rowsDe(wb.Sheets[nome]), a.aba));
    }
    const ocu = achaAba(wb, "ocupacao");
    if (ocu) detalhe.push(...lerOcupacao(rowsDe(wb.Sheets[ocu]), avisos));

    // grava fatura (upsert por competência+versão)
    const reg = {
      ...base, simulado: resumo.simulado, valor_total: valorTotal, valor_desconto: desconto, valor_faturar: valorFaturar,
      minimo_fixo: resumo.tot.minimo_fixo ?? null, valor_minimo: resumo.tot.valor_minimo ?? null,
      status: "recebida", lida_em: new Date().toISOString(), erro: null,
      observacao: observ.length ? observ.join(" · ") : null,
    };
    const { data: fat, error: fe } = await sb.from("xpm_fatura").upsert(reg, { onConflict: "competencia,versao" }).select("id").single();
    if (fe || !fat) throw new Error(`Gravar xpm_fatura: ${fe?.message}`);
    const faturaId = fat.id as string;

    const { error: dl } = await sb.from("xpm_fatura_linha").delete().eq("fatura_id", faturaId);
    if (dl) throw new Error(`Limpar linhas: ${dl.message}`);
    const { error: dd } = await sb.from("xpm_fatura_detalhe").delete().eq("fatura_id", faturaId);
    if (dd) throw new Error(`Limpar detalhe: ${dd.message}`);

    const { error: le } = await sb.from("xpm_fatura_linha").insert(linhas.map(({ _processo, ...l }) => ({ ...l, fatura_id: faturaId })));
    if (le) throw new Error(`Gravar linhas: ${le.message}`);
    for (let i = 0; i < detalhe.length; i += 500) {
      const { error } = await sb.from("xpm_fatura_detalhe").insert(detalhe.slice(i, i + 500).map((d) => ({ ...d, fatura_id: faturaId })));
      if (error) throw new Error(`Gravar detalhe: ${error.message}`);
    }

    // versões anteriores da competência viram substituídas
    const { error: sx } = await sb.from("xpm_fatura").update({ status: "substituida" }).eq("competencia", competencia).lt("versao", versao).neq("status", "substituida");
    if (sx) throw new Error(`Marcar substituída: ${sx.message}`);

    const porAba: Record<string, number> = {};
    for (const d of detalhe) porAba[d.aba] = (porAba[d.aba] ?? 0) + 1;
    return json({ fatura_id: faturaId, competencia, versao, linhas: linhas.length, detalhe_por_aba: porAba, avisos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("importar-fatura-xpm:", msg);
    return json({ error: msg, avisos }, 500);
  }
});

// deno-lint-ignore no-explicit-any
async function gravarErro(sb: any, r: { competencia: string | null; versao?: number; origem: string; resend_email_id: string | null; arquivo_nome: string | null; storage_path: string | null; erro: string }) {
  console.error("importar-fatura-xpm erro_leitura:", r.erro.slice(0, 500));
  if (!r.competencia) return json({ error: r.erro, gravado: false, motivo: "competência não identificada" }, 422);
  let versao = r.versao;
  if (!versao) {
    const { data } = await sb.from("xpm_fatura").select("versao").eq("competencia", r.competencia).order("versao", { ascending: false }).limit(1);
    versao = (data?.[0]?.versao ?? 0) + 1;
  }
  const { data, error } = await sb.from("xpm_fatura").upsert({
    competencia: r.competencia, versao, origem: r.origem, resend_email_id: r.resend_email_id, arquivo_nome: r.arquivo_nome,
    storage_path: r.storage_path, status: "erro_leitura", erro: r.erro, lida_em: new Date().toISOString(),
  }, { onConflict: "competencia,versao" }).select("id").single();
  if (error) return json({ error: `${r.erro} | e falhou ao gravar erro: ${error.message}` }, 500);
  return json({ error: r.erro, fatura_id: data.id, status: "erro_leitura" }, 422);
}

async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(d)).map((x) => x.toString(16).padStart(2, "0")).join("");
}
