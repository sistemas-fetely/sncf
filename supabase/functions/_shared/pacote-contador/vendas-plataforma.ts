// Vendas por plataforma: só lê vw_contabil_vendas_plataforma (regra de canal/meio vive no banco).
// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx@0.18.5";

const SEL = "nf_id,competencia,numero,serie,data_emissao,estabelecimento,cliente,tipo_cliente,valor_nota,canal,pedido,meio_pagamento";
const red = (n: number) => Math.round(n * 100) / 100;
const dataBr = (d: string | null) => d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : "";
export const ehTransferencia = (canal: string | null) => String(canal ?? "").startsWith("Transferência");
async function todas(q: any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Vendas por plataforma: consulta sem dados válidos.");
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export async function montarVendasPlataforma(userDb: any, competencia: string) {
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) throw new Error("Vendas por plataforma: competência inválida.");
  const brutas = await todas(userDb.from("vw_contabil_vendas_plataforma").select(SEL).eq("competencia", competencia).order("data_emissao").order("numero"));
  const linhas = brutas.map(l => {
    const v = Number(l.valor_nota);
    if (l.valor_nota == null || !Number.isFinite(v)) throw new Error(`Vendas por plataforma: NF ${l.numero ?? l.nf_id} sem valor válido.`);
    return { ...l, canal: l.canal ?? "Outros / sem vínculo", valor_nota: red(v) };
  });
  const canais = new Map<string, { canal: string; qtd: number; total: number }>();
  const meios = new Map<string, { canal: string; meio_pagamento: string; tipo_cliente: string; qtd: number; total: number }>();
  for (const l of linhas) {
    const c = canais.get(l.canal) ?? { canal: l.canal, qtd: 0, total: 0 }; c.qtd++; c.total += l.valor_nota; canais.set(l.canal, c);
    const meio = l.meio_pagamento ?? "", tipo = l.tipo_cliente ?? "?", k = `${l.canal}|${meio}|${tipo}`;
    const m = meios.get(k) ?? { canal: l.canal, meio_pagamento: meio, tipo_cliente: tipo, qtd: 0, total: 0 }; m.qtd++; m.total += l.valor_nota; meios.set(k, m);
  }
  const ordem = (a: { canal: string; total: number }, b: { canal: string; total: number }) =>
    Number(ehTransferencia(a.canal)) - Number(ehTransferencia(b.canal)) || b.total - a.total || a.canal.localeCompare(b.canal, "pt-BR");
  const por_canal = [...canais.values()].map(c => ({ ...c, total: red(c.total) })).sort(ordem);
  const por_meio = [...meios.values()].map(m => ({ ...m, total: red(m.total) }))
    .sort((a, b) => ordem(a, b) || a.meio_pagamento.localeCompare(b.meio_pagamento, "pt-BR") || a.tipo_cliente.localeCompare(b.tipo_cliente));
  return { linhas, qtd: linhas.length, total: red(linhas.reduce((s, l) => s + l.valor_nota, 0)),
    total_vendas: red(linhas.filter(l => !ehTransferencia(l.canal)).reduce((s, l) => s + l.valor_nota, 0)), por_canal, por_meio };
}
export function xlsxVendasPlataforma(d: Awaited<ReturnType<typeof montarVendasPlataforma>>, mesAno: string): Uint8Array {
  const nfs = [[`Vendas por plataforma — ${mesAno} (NFs de saída autorizadas)`],
    ["NF", "Série", "Emissão", "Estabelecimento", "Cliente", "PF/PJ", "Valor NF (R$)", "Plataforma / canal", "Pedido", "Meio de pagamento"],
    ...d.linhas.map(l => [l.numero ?? "", l.serie ?? "", dataBr(l.data_emissao), l.estabelecimento ?? "", l.cliente ?? "", l.tipo_cliente ?? "?", l.valor_nota, l.canal, l.pedido ?? "", l.meio_pagamento ?? ""]),
    ["TOTAL", "", "", "", "", "", d.total]];
  const resumo = [["Plataforma / canal", "Qtd NFs", "Valor (R$)"], ...d.por_canal.map(c => [c.canal, c.qtd, c.total]),
    ["TOTAL VENDAS (sem transferências)", d.por_canal.filter(c => !ehTransferencia(c.canal)).reduce((s, c) => s + c.qtd, 0), d.total_vendas]];
  const meio = [["Plataforma / canal", "Meio de pagamento", "PF/PJ", "Qtd NFs", "Valor (R$)"], ...d.por_meio.map(m => [m.canal, m.meio_pagamento, m.tipo_cliente, m.qtd, m.total])];
  const ws = XLSX.utils.aoa_to_sheet(nfs), rs = XLSX.utils.aoa_to_sheet(resumo), ms = XLSX.utils.aoa_to_sheet(meio);
  const fimNf = nfs.length - 1;
  ws[`G${nfs.length}`] = { t: "n", v: d.total, f: fimNf >= 3 ? `SUM(G3:G${fimNf})` : "0" };
  const fmt = (s: XLSX.WorkSheet, col: string, ini: number, fim: number) => { for (let r = ini; r <= fim; r++) if (s[`${col}${r}`]) s[`${col}${r}`].z = "#,##0.00"; };
  fmt(ws, "G", 3, nfs.length); fmt(rs, "C", 2, resumo.length); fmt(ms, "E", 2, meio.length);
  ws["!cols"] = [10, 7, 12, 22, 44, 7, 16, 28, 16, 24].map(wch => ({ wch }));
  rs["!cols"] = [36, 10, 18].map(wch => ({ wch }));
  ms["!cols"] = [28, 24, 7, 10, 18].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new(); wb.Props = { Title: `Vendas por plataforma — ${mesAno}` };
  XLSX.utils.book_append_sheet(wb, ws, "NFs por plataforma"); XLSX.utils.book_append_sheet(wb, rs, "Resumo por plataforma"); XLSX.utils.book_append_sheet(wb, ms, "Plataforma x meio");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
