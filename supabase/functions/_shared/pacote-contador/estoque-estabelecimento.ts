// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx@0.18.5";

const RAIZ = "63591078";
const ROTULOS: Record<string, string> = { "63591078000148": "Matriz — São Paulo/SP", "63591078000229": "Filial — Joinville/SC" };
const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const cnpjBr = (v: string) => v.length === 14 ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}` : v;
const red = (v: number, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
type Centro = { id: string; codigo: string; uf: string | null; cnpj_emitente: string | null; centro_fiscal_id: string | null; participante_cnpj: string | null };
export type LinhaBlocoK = { centro: string; codigo_produto: string; sku: string; produto: string; unidade: string | null; ncm: string | null; quantidade: number | string; valor_total: number | string; participante_cnpj: string | null; participante_nome: string | null };
type Linha = { estabelecimento: string; cnpj: string; codigo_produto: string; sku: string; produto: string; unidade: string | null; ncm: string | null; quantidade: number; valor_total: number; valor_unitario: number; participante_cnpj: string; participante_nome: string | null };

export async function montarEstoqueEstabelecimento(admin: any, linhasBlocoK: LinhaBlocoK[]) {
  const centros: Centro[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from("centro_distribuicao").select("id,codigo,uf,cnpj_emitente,centro_fiscal_id,participante_cnpj").order("codigo").range(de, de + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Estoque por estabelecimento: consulta de centros inválida.");
    centros.push(...data);
    if (data.length < 1000) break;
  }
  const porCodigo = new Map(centros.map(c => [c.codigo, c]));
  const porId = new Map(centros.map(c => [c.id, c]));
  const consolidado = new Map<string, Linha>();
  const detalhe: { estabelecimento: string; cnpj: string; codigo_produto: string; sku: string; produto: string; centro: string; quantidade: number; valor_total: number }[] = [];
  for (const l of linhasBlocoK) {
    const centro = porCodigo.get(l.centro);
    const fiscal = centro?.centro_fiscal_id ? porId.get(centro.centro_fiscal_id) : undefined;
    const participanteCentro = digitos(centro?.participante_cnpj);
    const cnpj = digitos(centro?.cnpj_emitente) || digitos(fiscal?.cnpj_emitente)
      || (participanteCentro.startsWith(RAIZ) ? participanteCentro : "")
      || digitos(centro?.uf ? centros.find(c => c.uf === centro.uf && digitos(c.cnpj_emitente))?.cnpj_emitente : null);
    if (!centro || !cnpj || cnpj.length !== 14) throw new Error(`Estoque por estabelecimento: centro ${l.centro} sem estabelecimento resolvível.`);
    const estabelecimento = ROTULOS[cnpj] ?? cnpjBr(cnpj);
    const participante = digitos(centro.participante_cnpj ?? l.participante_cnpj);
    const externo = participante && !participante.startsWith(RAIZ) ? participante : "";
    const quantidade = Number(l.quantidade), valor = Number(l.valor_total);
    if (l.quantidade == null || l.valor_total == null || !Number.isFinite(quantidade) || !Number.isFinite(valor)) throw new Error(`Estoque por estabelecimento: centro ${l.centro}, produto ${l.codigo_produto} com quantidade/valor inválido.`);
    const k = JSON.stringify([cnpj, l.codigo_produto, externo]);
    const a = consolidado.get(k) ?? { estabelecimento, cnpj, codigo_produto: l.codigo_produto, sku: l.sku, produto: l.produto, unidade: l.unidade, ncm: l.ncm, quantidade: 0, valor_total: 0, valor_unitario: 0, participante_cnpj: externo, participante_nome: l.participante_nome };
    a.quantidade += quantidade; a.valor_total += valor; consolidado.set(k, a);
    detalhe.push({ estabelecimento, cnpj, codigo_produto: l.codigo_produto, sku: l.sku, produto: l.produto, centro: l.centro, quantidade, valor_total: valor });
  }
  const ordem = (a: { cnpj: string; codigo_produto: string }, b: { cnpj: string; codigo_produto: string }) => a.cnpj.localeCompare(b.cnpj) || a.codigo_produto.localeCompare(b.codigo_produto, "pt-BR", { numeric: true });
  const linhas = [...consolidado.values()].map(l => ({ ...l, valor_unitario: l.quantidade ? red(l.valor_total / l.quantidade, 6) : 0, valor_total: red(l.valor_total) })).sort((a, b) => ordem(a, b) || a.participante_cnpj.localeCompare(b.participante_cnpj));
  const resumo = [...new Set(linhas.map(l => l.cnpj))].sort().map(cnpj => {
    const ls = linhas.filter(l => l.cnpj === cnpj);
    return { estabelecimento: ROTULOS[cnpj] ?? cnpjBr(cnpj), cnpj, linhas: ls.length, quantidade: ls.reduce((s, l) => s + l.quantidade, 0), valor: red(ls.reduce((s, l) => s + l.valor_total, 0)) };
  });
  return { linhas, resumo, detalhe: detalhe.sort((a, b) => ordem(a, b) || a.centro.localeCompare(b.centro)), quantidade: resumo.reduce((s, r) => s + r.quantidade, 0), valor: red(resumo.reduce((s, r) => s + r.valor, 0)) };
}

export function xlsxEstoqueEstabelecimento(d: Awaited<ReturnType<typeof montarEstoqueEstabelecimento>>, mesAno: string): Uint8Array {
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(mesAno)) throw new Error("Estoque por estabelecimento: competência inválida.");
  const [mes, ano] = mesAno.split("/").map(Number);
  const dia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const wb = XLSX.utils.book_new();
  const resumo = XLSX.utils.aoa_to_sheet([[`Posição de estoque em ${dia}/${mesAno} (Bloco K)`],
    ["Estabelecimento", "CNPJ", "Linhas (códigos)", "Quantidade", "Valor total"],
    ...d.resumo.map(r => [r.estabelecimento, cnpjBr(r.cnpj), r.linhas, r.quantidade, r.valor]),
    ["Total", "", d.linhas.length, d.quantidade, d.valor]]);
  const fim = d.resumo.length + 2, total = fim + 1;
  for (const col of ["C", "D", "E"]) resumo[`${col}${total}`] = { t: "n", v: col === "C" ? d.linhas.length : col === "D" ? d.quantidade : d.valor, f: fim >= 3 ? `SUM(${col}3:${col}${fim})` : "0" };
  const fmt = (ws: XLSX.WorkSheet, cols: string[], ini: number, fim: number, z: string) => { for (const col of cols) for (let r = ini; r <= fim; r++) if (ws[`${col}${r}`]) ws[`${col}${r}`].z = z; };
  fmt(resumo, ["C", "D"], 3, total, "#,##0"); fmt(resumo, ["E"], 3, total, "#,##0.00");
  resumo["!cols"] = [32, 22, 18, 20, 22].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, resumo, "Resumo");
  for (const [cnpj, aba] of [["63591078000148", "Matriz SP"], ["63591078000229", "Filial SC"]]) {
    const ls = d.linhas.filter(l => l.cnpj === cnpj);
    const ws = XLSX.utils.aoa_to_sheet([["Código do produto", "SKU", "Nome do produto", "Unidade", "NCM", "Quantidade", "Valor unitário (custo médio)", "Valor total", "Estoque em poder de", "CNPJ do participante"],
      ...ls.map(l => [l.codigo_produto, l.sku, l.produto, l.unidade ?? "", l.ncm ?? "", l.quantidade, l.valor_unitario, l.valor_total, l.participante_cnpj ? `Próprio, em poder de terceiros — ${l.participante_nome ?? cnpjBr(l.participante_cnpj)}` : "Próprio, em poder da Fetely", cnpjBr(l.participante_cnpj)])]);
    fmt(ws, ["F"], 2, ls.length + 1, "#,##0"); fmt(ws, ["G"], 2, ls.length + 1, "#,##0.000000"); fmt(ws, ["H"], 2, ls.length + 1, "#,##0.00");
    ws["!cols"] = [20, 24, 60, 10, 14, 18, 30, 22, 65, 24].map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, aba);
  }
  const detalhe = XLSX.utils.aoa_to_sheet([["Estabelecimento", "Código", "SKU", "Produto", "Local (centro)", "Quantidade", "Valor total"], ...d.detalhe.map(l => [l.estabelecimento, l.codigo_produto, l.sku, l.produto, l.centro, l.quantidade, l.valor_total])]);
  fmt(detalhe, ["F"], 2, d.detalhe.length + 1, "#,##0"); fmt(detalhe, ["G"], 2, d.detalhe.length + 1, "#,##0.00");
  detalhe["!cols"] = [32, 20, 24, 60, 26, 18, 22].map(wch => ({ wch }));
  XLSX.utils.book_append_sheet(wb, detalhe, "Detalhe por local");
  wb.Props = { Title: `Estoque por estabelecimento — ${mesAno}` };
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}