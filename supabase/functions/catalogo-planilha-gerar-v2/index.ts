import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import XLSX from "https://esm.sh/xlsx-js-style@1.2.0";
import { gateCronOuSessao } from "../_shared/gate-cron.ts";
import { exigirAcao } from "../_shared/permissao-acao.ts";
import { htmlParaTexto } from "../_shared/catalogo-planilha/html-texto.ts";
import { ABA_CODIGOS } from "../_shared/catalogo-planilha/nascimento.ts";

type Row = Record<string, unknown>;
type Tipo = "t" | "n" | "s";
type Col = [slug: string, rotulo: string, bloco: string, dono: string, valor: (r: Row) => unknown, tipo?: Tipo];
const C = "Sistema · consulta";
const v = (k: string) => (r: Row) => r[k];
const simNao = (k: string) => (r: Row) => r[k] === true ? "Sim" : r[k] === false ? "Não" : null;
const desc = (r: Row) => { const t = r.descricao_fonte; if (t == null) return null; return r.descricao_origem === "shopify_html" ? htmlParaTexto(String(t)) : t; };
const COLS: Col[] = [
  ["cod_cadastro", "Código", "Identidade", "Operações", v("cod_cadastro"), "t"],
  ["_codigo_externo", "Código nos canais", "Identidade", C, v("codigo_externo"), "t"],
  ["ean", "EAN", "Identidade", C, v("ean"), "t"],
  ["dun", "DUN", "Identidade", C, v("dun"), "t"],
  ["inner_qtd", "Inner", "Identidade", C, v("inner_qtd"), "n"],
  ["marca", "Marca", "Identidade", "Produto", v("marca")],
  ["ncm", "NCM", "Fiscal e físico", "Operações", v("ncm"), "t"],
  ["cest", "CEST", "Fiscal e físico", "Operações", v("cest"), "t"],
  ["origem_fisc", "Origem fiscal", "Fiscal e físico", "Operações", v("origem_fisc"), "t"],
  ["origem_prod", "Origem produto", "Fiscal e físico", "Operações", v("origem_prod")],
  ["grupo_tributario_bling", "Grupo tributário Bling", "Fiscal e físico", C, v("grupo_tributario_bling")],
  ["_fase_sncf", "Fase SNCF", "Situação", C, v("fase_sncf")],
  ["loja_b2b", "B2B", "Lojas", "Produto", r => r.em_cadastro === true ? "Sim" : null],
  ["loja_site", "Site", "Lojas", "Produto", r => r.no_shopify === true ? "Sim" : r.em_cadastro === true ? "Não" : null],
  ["loja_ml", "Mercado Livre", "Lojas", "Produto", () => null],
  ["loja_shopee", "Shopee", "Lojas", "Produto", () => null],
  ["loja_tiktok", "TikTok", "Lojas", "Produto", () => null],
  ...([["departamento", "Departamento"], ["categoria", "Categoria"], ["linha", "Linha"], ["familia", "Família"], ["grupo", "Grupo"], ["tipo", "Tipo"], ["colecao", "Coleção"], ["sub_colecao", "Subcoleção"], ["sub_colecao2", "Subcoleção 2"], ["cor_nome", "Nome da cor"], ["cor", "Cor"], ["estampa", "Estampa"], ["tamanho_numero", "Tamanho"], ["tamanho_ref", "Tamanho ref."]] as const).map(([s, l]) => [s, l, "Classificação", "Produto", v(s)] as Col),
  ["is_vela_numerica", "Vela numérica?", "Classificação", "Produto", simNao("is_vela_numerica")],
  ["numero_vela", "Nº da vela", "Classificação", "Produto", v("numero_vela"), "n"],
  ["material", "Material", "Classificação", "Produto", v("material")],
  ["tipo_embalagem", "Tipo de embalagem", "Classificação", "Produto", v("tipo_embalagem")],
  ...([["peso_g", "Peso (g)"], ["altura_cm", "Altura (cm)"], ["largura_cm", "Largura (cm)"], ["profundidade_cm", "Profundidade (cm)"]] as const).map(([s, l]) => [s, l, "Classificação", "Produto", v(s), "n"] as Col),
  ["nome_comercial", "Nome comercial", "Comercial", "Produto", v("nome_comercial")],
  ["nome_completo", "Nome completo", "Comercial", "Produto", v("nome_completo")],
  ["nome_operacional", "Nome operacional (Bling/XPM)", "Comercial", C, v("nome_operacional")],
  ["qtd_kit", "Qtd. kit", "Comercial", "Produto", v("qtd_kit"), "n"],
  ["material_descritivo", "Material (comercial)", "Comercial", "Produto", v("material_descritivo")],
  ["descricao_produto", "Descrição", "Comercial", "Produto", desc],
  ["meta_descricao", "Meta descrição", "Comercial", "Produto", v("meta_descricao")],
];
// Aba "Códigos e EAN": controle editável do par código↔EAN e do inner; EAN/DUN/situação são consulta.
const COLS_CODIGOS: Col[] = [
  ["cod_cadastro", "Cód. Cadastro", "Códigos", "Operações", v("cod_cadastro"), "t"],
  ["ean", "EAN13", "Códigos", C, v("ean"), "t"],
  ["dun", "DUN14", "Códigos", C, v("dun"), "t"],
  ["inner_qtd", "Inner", "Códigos", "Operações", v("inner_qtd"), "n"],
  ["situacao", "Situação", "Códigos", C, v("situacao")],
];
const COR_BLOCO: Record<string, string> = { "Identidade": "DDEBF7", "Fiscal e físico": "FCE4D6", "Situação": "EDEDED", "Lojas": "E2EFDA", "Classificação": "FFF2CC", "Comercial": "EAD1F5", "Códigos": "DDEBF7" };
const CINZA = "E7E6E6";
const json = (b: unknown, status: number) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function montarAba(cols: Col[], linhas: Row[]) {
  const ws: Record<string, unknown> = {};
  const borda = { bottom: { style: "thin", color: { rgb: "BFBFBF" } } };
  cols.forEach(([slug, rotulo, bloco, dono, val, tipo], c) => {
    const consulta = dono === C;
    const cab = [dono, bloco, slug, rotulo];
    cab.forEach((t, r) => {
      const fill = consulta ? CINZA : r === 1 ? COR_BLOCO[bloco] : undefined;
      ws[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: t, s: { font: { bold: true, color: r === 2 ? { rgb: "7F7F7F" } : undefined }, ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}), ...(r === 3 ? { border: borda } : {}) } };
    });
    linhas.forEach((row, i) => {
      const x = val(row);
      if (x == null || x === "") return;
      const s: Record<string, unknown> = {};
      if (consulta) s.fill = { patternType: "solid", fgColor: { rgb: CINZA } };
      if (slug === "descricao_produto") s.alignment = { wrapText: true, vertical: "top" };
      const num = tipo === "n" ? Number(x) : NaN;
      const cell = tipo === "n" && Number.isFinite(num) ? { t: "n", v: num } : typeof x === "number" && tipo !== "t" ? { t: "n", v: x } : { t: "s", v: String(x), ...(tipo === "t" ? { z: "@" } : {}) };
      ws[XLSX.utils.encode_cell({ r: i + 4, c })] = { ...cell, s };
    });
  });
  const ultima = XLSX.utils.encode_cell({ r: Math.max(3, linhas.length + 3), c: cols.length - 1 });
  ws["!ref"] = `A1:${ultima}`;
  ws["!autofilter"] = { ref: `A4:${ultima}` };
  ws["!cols"] = cols.map(([slug, rotulo]) => ({ wch: slug === "descricao_produto" ? 60 : slug === "meta_descricao" ? 40 : Math.min(32, Math.max(12, rotulo.length + 2)) }));
  ws["!freeze"] = { xSplit: 1, ySplit: 4 };
  ws["!views"] = [{ state: "frozen", xSplit: 1, ySplit: 4, topLeftCell: "B5" }];
  return ws;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const negado = await gateCronOuSessao(req, sb, corsHeaders); if (negado) return negado;
    const a = await exigirAcao(sb, req.headers.get("Authorization"), "acao.produto_importar_planilha_cadastro", "gerar planilha v2");
    if (!a.ok) return json({ ok: false, erro: a.erro }, a.status);
    const linhas: Row[] = [];
    for (let de = 0; ; de += 1000) {
      const q = await sb.from("vw_catalogo_planilha_v2").select("*").order("cod_cadastro").range(de, de + 999);
      if (q.error) throw q.error;
      linhas.push(...(q.data as Row[]));
      if (q.data.length < 1000) break;
    }
    const codigos: Row[] = [];
    for (let de = 0; ; de += 1000) {
      const q = await sb.from("vw_catalogo_planilha_v2_codigos").select("*").order("banco_ean", { nullsFirst: false }).order("ean").range(de, de + 999);
      if (q.error) throw q.error;
      codigos.push(...(q.data as Row[]));
      if (q.data.length < 1000) break;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, montarAba(COLS, linhas), "Catálogo");
    XLSX.utils.book_append_sheet(wb, montarAba(COLS_CODIGOS, codigos), ABA_CODIGOS);
    const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    return new Response(bytes, { headers: { ...corsHeaders, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="catalogo_fetely_completo_v2.xlsx"' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return json({ ok: false, erro: msg }, 500);
  }
});
