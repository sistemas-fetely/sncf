// Leitura no navegador dos relatórios da plataforma (Sublimity) do consignado
// venda_fora. Monta o payload de fn_venda_fora_importar; as regras ficam no banco.
import * as XLSX from "xlsx";
import JSZip from "jszip";

const NS = "http://www.portalfiscal.inf.br/nfe";
type Linha = Record<string, string | number | null>;

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** "R$ 1.234,56" → 1234.56; "1,234.56" → 1234.56; número passa direto. */
export function paraNumero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/R\$|\s|%/g, "");
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()\-]/g, "");
  const iv = s.lastIndexOf(","), ip = s.lastIndexOf(".");
  if (iv > ip) s = s.replace(/\./g, "").replace(",", ".");
  else if (ip > iv && iv >= 0) s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/** dd/mm/aaaa [hh:mm] ou serial do Excel → ISO (data ou data-hora). */
export function paraData(v: unknown, comHora = false): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const dt = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    return comHora ? `${dt}T${String(d.H).padStart(2, "0")}:${String(d.M).padStart(2, "0")}:00-03:00` : dt;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const a = m[3].length === 2 ? `20${m[3]}` : m[3];
    const dt = `${a}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return comHora ? `${dt}T${(m[4] ?? "0").padStart(2, "0")}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00` : dt;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return comHora ? s : s.slice(0, 10);
  return null;
}

/** Caminho do XML no bucket contabil: nfs/<AAAA-MM>/saida/<nNF 6 dígitos>-<serie>.xml */
export function caminhoXmlSaida(dataEmissao: string, numero: string, serie: string) {
  return `nfs/${dataEmissao.slice(0, 7)}/saida/${String(Number(numero)).padStart(6, "0")}-${serie}.xml`;
}

/** Período e id do nome resumo_seller_<id>_<AAAA-MM-DD>_<AAAA-MM-DD>_... */
export function periodoDoNome(nome: string): { inicio: string; fim: string } | null {
  const m = nome.match(/(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})/);
  return m ? { inicio: m[1], fim: m[2] } : null;
}

/** Lê uma aba procurando a linha de cabeçalho que contém `chave`. Devolve texto e valor bruto. */
function lerAba(wb: XLSX.WorkBook, nomeAba: string, chave: string): { txt: Linha; raw: Linha }[] {
  const nome = wb.SheetNames.find((n) => norm(n) === norm(nomeAba));
  if (!nome) return [];
  const ws = wb.Sheets[nome];
  const txt = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const h = txt.findIndex((r, i) => i < 10 && r.some((c) => norm(String(c)) === norm(chave)));
  if (h < 0) throw new Error(`Aba "${nomeAba}" sem cabeçalho "${chave}".`);
  const cab = txt[h].map((c) => String(c).trim());
  const out: { txt: Linha; raw: Linha }[] = [];
  for (let i = h + 1; i < txt.length; i++) {
    if (!txt[i].some((c) => String(c).trim() !== "")) continue;
    const t: Linha = {}, r: Linha = {};
    cab.forEach((c, j) => { if (c) { t[norm(c)] = String(txt[i][j] ?? "").trim(); r[norm(c)] = (raw[i]?.[j] ?? null) as never; } });
    out.push({ txt: t, raw: r });
  }
  return out;
}

const lerWb = async (f: File) => XLSX.read(await f.arrayBuffer(), { type: "array" });
const s = (l: { txt: Linha }, k: string) => { const v = l.txt[norm(k)]; return v == null || v === "" ? null : String(v); };
const n = (l: { txt: Linha; raw: Linha }, k: string) => paraNumero(l.raw[norm(k)] ?? l.txt[norm(k)]);
const d = (l: { txt: Linha; raw: Linha }, k: string) => paraData(l.raw[norm(k)] ?? l.txt[norm(k)]);

export async function lerResumoSeller(f: File) {
  const wb = await lerWb(f);
  const vend = lerAba(wb, "Produtos Vendidos", "Lacre");
  if (!vend.length) throw new Error('resumo_seller: aba "Produtos Vendidos" vazia ou ausente.');
  const agenda = new Map<string, { txt: Linha; raw: Linha }>();
  for (const a of lerAba(wb, "Agenda de Recebíveis", "Lacre")) { const k = s(a, "Lacre"); if (k) agenda.set(k, a); }
  const pega = <T,>(fn: (l: { txt: Linha; raw: Linha }) => T | null, a: { txt: Linha; raw: Linha } | undefined, v: { txt: Linha; raw: Linha }) =>
    (a ? fn(a) : null) ?? fn(v);
  const unidades = vend.map((v) => {
    const a = agenda.get(s(v, "Lacre") ?? "");
    const S = (k: string) => pega((l) => s(l, k), a, v);
    const N = (k: string) => pega((l) => n(l, k), a, v);
    const D = (k: string) => pega((l) => d(l, k), a, v);
    return {
      lacre: s(v, "Lacre"), agenda_id: S("ID Agenda"), atendimento: S("Atendimento"), pre_venda: S("Pré-venda"),
      vendedor: S("Vendedor"), ean: S("EAN"), produto: S("Produto"), data_venda: D("Data venda"),
      valor_venda: N("Vendas"), comissao: N("Comissão Raas"), liquido_seller: N("Líquido Seller"),
      nf_chave: S("DANFE V.")?.replace(/\D/g, "") || null, forma_pagamento: S("Forma Pagamento"),
      prevista_liquidacao: D("Prevista Liquidação"), data_liquidacao: D("Data Liquidação"),
      mdr_taxa: N("Taxa MDR Cob."), mdr_valor: N("Valor MDR Cob."), valor_liquidar: N("Valor a Liquidar"),
      liquidacao_id: S("ID Liquidação"), status: S("Status"),
    };
  });
  let devolucoes: Linha[] = [];
  try { devolucoes = lerAba(wb, "Produtos Devolvidos", "Lacre").map((l) => l.txt); } catch { devolucoes = []; }
  const lojaCol = vend.map((v) => s(v, "Loja código") ?? s(v, "Loja fantasia") ?? s(v, "Loja") ?? s(v, "Filial")).find(Boolean);
  return { unidades, devolucoes, loja: lojaCol?.match(/\d{3,}/)?.[0] ?? null };
}

export type NfLida = {
  chave: string; numero: string; serie: string; data_emissao: string; valor_nota: number | null;
  dest_doc: string | null; dest_nome: string | null; situacao: "autorizada"; xml_storage_path: string | null;
  itens: { ean: string | null; cprod: string | null; descricao: string | null; qtd: number | null; valor_unit: number | null; valor_total: number | null; cfop: string | null }[];
};

export async function lerXmlZip(f: File): Promise<{ nfs: NfLida[]; xmls: Map<string, string> }> {
  const zip = await JSZip.loadAsync(await f.arrayBuffer());
  const nfs: NfLida[] = []; const xmls = new Map<string, string>();
  for (const e of Object.values(zip.files)) {
    if (e.dir || !/\.xml$/i.test(e.name)) continue;
    const texto = await e.async("string");
    const doc = new DOMParser().parseFromString(texto, "application/xml");
    const inf = doc.getElementsByTagNameNS(NS, "infNFe")[0];
    if (!inf) continue;
    const t = (el: Element | Document | undefined, tag: string) => el ? (el.getElementsByTagNameNS(NS, tag)[0]?.textContent?.trim() || null) : null;
    const ide = inf.getElementsByTagNameNS(NS, "ide")[0];
    const dest = inf.getElementsByTagNameNS(NS, "dest")[0];
    const tot = inf.getElementsByTagNameNS(NS, "ICMSTot")[0];
    const chave = (inf.getAttribute("Id") ?? "").replace(/^NFe/, "");
    const numero = t(ide, "nNF") ?? ""; const serie = t(ide, "serie") ?? "";
    const itens = Array.from(inf.getElementsByTagNameNS(NS, "det")).map((det) => {
      const p = det.getElementsByTagNameNS(NS, "prod")[0];
      return { ean: t(p, "cEAN"), cprod: t(p, "cProd"), descricao: t(p, "xProd"), qtd: paraNumero(t(p, "qCom")),
        valor_unit: paraNumero(t(p, "vUnCom")), valor_total: paraNumero(t(p, "vProd")), cfop: t(p, "CFOP") };
    });
    nfs.push({ chave, numero, serie, data_emissao: t(ide, "dhEmi") ?? "", valor_nota: paraNumero(t(tot, "vNF")),
      dest_doc: t(dest, "CPF") ?? t(dest, "CNPJ"), dest_nome: t(dest, "xNome"), situacao: "autorizada", xml_storage_path: null, itens });
    xmls.set(chave, texto);
  }
  if (!nfs.length) throw new Error("O zip não tem XML de NF-e.");
  return { nfs, xmls };
}

/** Estoque por EAN: loja = Filial começa com o código e Status sem "TRANSFERIDO"; trânsito = Status com "TRANSFERIDO". */
export async function lerEstoque(f: File, loja: string) {
  const linhas = lerAba(await lerWb(f), "Produtos Detalhados", "EAN");
  const m = new Map<string, { ean: string; qtd_loja: number; qtd_em_transito: number }>();
  for (const l of linhas) {
    const ean = s(l, "EAN"); if (!ean) continue;
    const st = (s(l, "Status") ?? "").toUpperCase(); const fil = s(l, "Filial") ?? "";
    const g = m.get(ean) ?? { ean, qtd_loja: 0, qtd_em_transito: 0 };
    if (st.includes("TRANSFERIDO")) g.qtd_em_transito++;
    else if (loja && fil.startsWith(loja)) g.qtd_loja++;
    m.set(ean, g);
  }
  return [...m.values()];
}

export async function lerLiquidacoes(f: File) {
  const wb = await lerWb(f);
  return lerAba(wb, wb.SheetNames[0], "ID").map((l) => ({
    id: s(l, "ID"), transacao: s(l, "Transação"), data: paraData(l.raw[norm("Data")] ?? l.txt[norm("Data")], true),
    valor: n(l, "Valor"), status: s(l, "Status"),
  })).filter((x) => x.id);
}
