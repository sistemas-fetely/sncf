// Posição histórica dos recebíveis B2B no fim da competência; não altera títulos.
// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx@0.18.5";

const SEL = "id,cliente,parceiro_id,numero_titulo,numero_parcela,total_parcelas,pedido_ref,nf_numero,data_compra,data_vencimento,valor,meio_pagamento,estado_rotulo,data_recebimento";
const red = (n: number) => Math.round(n * 100) / 100;
export const dataClientesAberto = (d: string | null) => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "";
const cnpjBr = (c: string | null) => { const n = (c ?? "").replace(/\D/g, ""); return n.length === 14 ? `${n.slice(0, 2)}.${n.slice(2, 5)}.${n.slice(5, 8)}/${n.slice(8, 12)}-${n.slice(12)}` : c ?? ""; };
async function todas(q: any): Promise<any[]> {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Clientes em aberto: consulta sem dados válidos.");
    out.push(...data);
    if (data.length < 1000) return out;
  }
}
export async function montarClientesAberto(admin: any, fim: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim) || !Number.isFinite(Date.parse(fim)) || new Date(`${fim}T00:00:00Z`).toISOString().slice(0, 10) !== fim) throw new Error("Clientes em aberto: data de posição inválida.");
  const linhas = await todas(admin.from("vw_recebivel_b2b").select(SEL).lte("data_compra", fim).eq("estado_terminal", false)
    .or(`estado_em_aberto.eq.true,data_recebimento.gt.${fim}`).order("id"));
  const docs = new Map<string, any>();
  for (let i = 0; i < linhas.length; i += 200) {
    const { data, error } = await admin.from("vw_titulos_cobranca").select("id,parceiro_cnpj,parceiro_razao_social").in("id", linhas.slice(i, i + 200).map(l => l.id));
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Clientes em aberto: consulta de CNPJ sem dados válidos.");
    for (const d of data) docs.set(d.id, d);
  }
  const titulos = linhas.map(l => {
    const valor = Number(l.valor);
    if (l.valor == null || !Number.isFinite(valor)) throw new Error(`Clientes em aberto: título ${l.id} sem valor válido.`);
    const vencido = l.data_vencimento != null && l.data_vencimento < fim;
    const dias = l.data_vencimento ? Math.max(0, Math.round((Date.parse(fim) - Date.parse(String(l.data_vencimento).slice(0, 10))) / 86400000)) : 0;
    if (!Number.isFinite(dias)) throw new Error(`Clientes em aberto: título ${l.id} com vencimento inválido.`);
    return { ...l, cliente: l.cliente ?? docs.get(l.id)?.parceiro_razao_social ?? "", cnpj: docs.get(l.id)?.parceiro_cnpj ?? null,
      valor: red(valor), situacao: vencido ? "vencido" : "a_vencer", dias_atraso: dias, recebido_depois: l.data_recebimento != null };
  });
  const grupos = new Map<string | null, { cliente: string; cnpj: string | null; qtd: number; total: number; vencido: number; qtd_vencidos: number; maior_atraso: number }>();
  for (const t of titulos) {
    const g = grupos.get(t.parceiro_id) ?? { cliente: t.cliente, cnpj: t.cnpj, qtd: 0, total: 0, vencido: 0, qtd_vencidos: 0, maior_atraso: 0 };
    g.qtd++; g.total += t.valor;
    if (t.situacao === "vencido") { g.vencido += t.valor; g.qtd_vencidos++; }
    g.maior_atraso = Math.max(g.maior_atraso, t.dias_atraso); grupos.set(t.parceiro_id, g);
  }
  const por_cliente = [...grupos.values()].map(g => ({ ...g, total: red(g.total), vencido: red(g.vencido) })).sort((a, b) => b.total - a.total);
  const vencidos = titulos.filter(t => t.situacao === "vencido");
  return { fim, titulos, total: red(titulos.reduce((s, t) => s + t.valor, 0)), total_vencido: red(vencidos.reduce((s, t) => s + t.valor, 0)),
    qtd: titulos.length, qtd_vencidos: vencidos.length, clientes: new Set(titulos.map(t => t.parceiro_id).filter((id): id is string => id != null)).size, por_cliente };
}
export function xlsxClientesAberto(dados: Awaited<ReturnType<typeof montarClientesAberto>>, mesAno: string): Uint8Array {
  const titulos = [...dados.titulos].sort((a, b) => a.cliente.localeCompare(b.cliente, "pt-BR") || String(a.data_vencimento ?? "").localeCompare(String(b.data_vencimento ?? "")));
  const aoa = [[`Clientes em aberto — posição em ${dataClientesAberto(dados.fim)}`],
    ["Cliente", "CNPJ", "Título", "Parcela", "Pedido", "NF", "Emissão", "Vencimento", "Dias atraso", "Valor (R$)", "Meio", `Situação em ${dataClientesAberto(dados.fim).slice(0, 5)}`, "Recebido depois"],
    ...titulos.map(t => [t.cliente, cnpjBr(t.cnpj), t.numero_titulo ?? "", t.numero_parcela != null ? `${t.numero_parcela}/${t.total_parcelas ?? ""}` : "", t.pedido_ref ?? "", t.nf_numero ?? "", dataClientesAberto(t.data_compra), dataClientesAberto(t.data_vencimento), t.dias_atraso, t.valor, t.meio_pagamento ?? "", t.situacao === "vencido" ? "Vencido" : "A vencer", dataClientesAberto(t.data_recebimento)]),
    ["TOTAL", "", dados.qtd, "", "", "", "", "", "", dados.total]];
  const resumo = [["Cliente", "CNPJ", "Títulos", "Total em aberto (R$)", "Vencido (R$)", "Títulos vencidos", "Maior atraso (dias)"],
    ...dados.por_cliente.map(g => [g.cliente, cnpjBr(g.cnpj), g.qtd, g.total, g.vencido, g.qtd_vencidos, g.maior_atraso]),
    ["TOTAL", "", dados.qtd, dados.total, dados.total_vencido, dados.qtd_vencidos, ""]];
  const ws = XLSX.utils.aoa_to_sheet(aoa), rs = XLSX.utils.aoa_to_sheet(resumo);
  // Totais dinâmicos, com resultado em cache para leitores que não recalculam.
  const soma = (s: XLSX.WorkSheet, ref: string, col: string, ini: number, fim: number, valor: number) => { s[ref] = { t: "n", v: valor, f: fim >= ini ? `SUM(${col}${ini}:${col}${fim})` : "0" }; };
  const ultima = aoa.length, fimTit = ultima - 1, fimResumo = resumo.length - 1;
  ws[`C${ultima}`] = { t: "n", v: dados.qtd, f: dados.qtd ? `COUNTA(A3:A${fimTit})` : "0" };
  soma(ws, `J${ultima}`, "J", 3, fimTit, dados.total);
  for (const [col, valor] of [["C", dados.qtd], ["D", dados.total], ["E", dados.total_vencido], ["F", dados.qtd_vencidos]] as const) soma(rs, `${col}${resumo.length}`, col, 2, fimResumo, valor);
  ws["!cols"] = [48, 22, 18, 10, 18, 12, 14, 14, 12, 18, 18, 20, 18].map(wch => ({ wch }));
  rs["!cols"] = [48, 22, 12, 24, 20, 18, 22].map(wch => ({ wch }));
  for (let r = 2; r < aoa.length; r++) if (ws[`J${r + 1}`]) ws[`J${r + 1}`].z = "#,##0.00";
  for (let r = 1; r < resumo.length; r++) for (const c of ["D", "E"]) if (rs[`${c}${r + 1}`]) rs[`${c}${r + 1}`].z = "#,##0.00";
  const wb = XLSX.utils.book_new(); wb.Props = { Title: `Clientes em aberto — ${mesAno}` };
  XLSX.utils.book_append_sheet(wb, ws, "Titulos em aberto"); XLSX.utils.book_append_sheet(wb, rs, "Resumo por cliente");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}