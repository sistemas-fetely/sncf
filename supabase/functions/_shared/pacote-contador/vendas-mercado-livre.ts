// Fonte única: a competência e os vínculos fiscais/comerciais pertencem à view.
// deno-lint-ignore-file no-explicit-any
import * as XLSX from "npm:xlsx@0.18.5";

const SEL = "competencia,conta,pedido,nf_numero,nf_data,nf_valor,data_venda,item,sku,bruto_mercado_pago,comissao,frete,parcelamento,impostos,tarifas,liquido,diferenca_bruto_nf,liberacao_prevista,liberado_em,valor_liberado,situacao,pedido_mercado_livre,pacote_mercado_livre,pagamento_mercado_pago,tipo_transacao,venda_id";
const DINHEIRO = ["nf_valor", "bruto_mercado_pago", "comissao", "frete", "parcelamento", "impostos", "tarifas", "liquido", "diferenca_bruto_nf", "valor_liberado"] as const;
const red = (n: number) => Math.round(n * 100) / 100;
export async function montarVendasMercadoLivre(userDb: any, competencia: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(competencia)) throw new Error("Vendas Mercado Livre: competência inválida.");
  const q = userDb.from("vw_contabil_vendas_mercado_livre").select(SEL).eq("competencia", competencia).order("data_venda").order("venda_id");
  const linhas: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q.range(de, de + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Vendas Mercado Livre: consulta sem dados válidos.");
    for (const original of data) {
      const l = { ...original };
      for (const campo of DINHEIRO) {
        if (l[campo] == null && ["nf_valor", "diferenca_bruto_nf", "valor_liberado"].includes(campo)) continue;
        if (l[campo] == null || !Number.isFinite(Number(l[campo]))) throw new Error(`Vendas Mercado Livre: venda ${l.venda_id} com ${campo} inválido.`);
        l[campo] = red(Number(l[campo]));
      }
      linhas.push(l);
    }
    if (data.length < 1000) break;
  }
  const soma = (campo: string, lista = linhas) => red(lista.reduce((s, l) => s + Number(l[campo] ?? 0), 0));
  const resumo = {
    qtd: linhas.length, total_nf: soma("nf_valor"), bruto: soma("bruto_mercado_pago"), tarifas: soma("tarifas"),
    comissao: soma("comissao"), frete: soma("frete"), parcelamento: soma("parcelamento"), liquido: soma("liquido"),
    liquido_liberado: soma("liquido", linhas.filter(l => l.situacao === "Liberado")),
    liquido_a_liberar: soma("liquido", linhas.filter(l => l.situacao !== "Liberado")),
    sem_nf: linhas.filter(l => !l.nf_numero).length, sem_pedido: linhas.filter(l => l.situacao === "Sem pedido no SNCF").length,
  };
  return { linhas, resumo, impostos: soma("impostos"), diferenca: soma("diferenca_bruto_nf") };
}

function dataExcel(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(`${v.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) throw new Error(`Vendas Mercado Livre: data inválida (${v}).`);
  return d;
}
export function xlsxVendasMercadoLivre(d: Awaited<ReturnType<typeof montarVendasMercadoLivre>>, mesAno: string): Uint8Array {
  const r = d.resumo;
  const vendas = [[`Vendas Mercado Livre — ${mesAno}`],
    ["Pedido", "NF", "Data da NF", "Valor da NF", "Data da venda", "Item", "Bruto (Mercado Pago)", "Comissão", "Frete", "Parcelamento", "Impostos", "Total de tarifas", "Líquido", "Diferença bruto − NF", "Liberação prevista", "Liberado em", "Situação", "Pedido Mercado Livre", "Pagamento Mercado Pago"],
    ...d.linhas.map(l => [l.pedido ?? "", l.nf_numero ?? "", dataExcel(l.nf_data), l.nf_valor, dataExcel(l.data_venda), l.item ?? "", l.bruto_mercado_pago, l.comissao, l.frete, l.parcelamento, l.impostos, l.tarifas, l.liquido, l.diferenca_bruto_nf, dataExcel(l.liberacao_prevista), dataExcel(l.liberado_em), l.situacao, l.pedido_mercado_livre ?? "", l.pagamento_mercado_pago ?? ""]),
    ["TOTAL", "", null, r.total_nf, null, "", r.bruto, r.comissao, r.frete, r.parcelamento, d.impostos, r.tarifas, r.liquido, d.diferenca]];
  const resumo = [[`Resumo Vendas Mercado Livre — ${mesAno}`], ["Indicador", "Valor"],
    ["Nº de vendas", r.qtd], ["Total das NFs", r.total_nf], ["Bruto Mercado Pago", r.bruto], ["Diferença bruto − NF", d.diferenca],
    ["Comissão", r.comissao], ["Frete", r.frete], ["Parcelamento", r.parcelamento], ["Impostos", d.impostos], ["Total de tarifas", r.tarifas],
    ["Líquido", r.liquido], ["Líquido já liberado", r.liquido_liberado], ["Líquido a liberar", r.liquido_a_liberar],
    ["Nº de vendas sem NF", r.sem_nf], ["Nº sem pedido no SNCF", r.sem_pedido], [],
    ["Tarifas descontadas pelo Mercado Livre antes da liberação. Conta Mercado Pago: MP-Meli (CNPJ 63.591.078/0001-48)."]];
  const ws = XLSX.utils.aoa_to_sheet(vendas, { cellDates: true }), rs = XLSX.utils.aoa_to_sheet(resumo);
  for (const col of ["D", "G", "H", "I", "J", "K", "L", "M", "N"]) {
    for (let row = 3; row <= vendas.length; row++) if (ws[`${col}${row}`]) ws[`${col}${row}`].z = "#,##0.00";
    ws[`${col}${vendas.length}`] = { t: "n", v: ws[`${col}${vendas.length}`]?.v ?? 0, f: d.linhas.length ? `SUM(${col}3:${col}${vendas.length - 1})` : "0", z: "#,##0.00" };
  }
  for (const col of ["C", "E", "O", "P"]) for (let row = 3; row < vendas.length; row++) if (ws[`${col}${row}`]) ws[`${col}${row}`].z = "dd/mm/yyyy";
  for (let row = 4; row <= 14; row++) rs[`B${row}`].z = "#,##0.00";
  ws["!cols"] = [16, 12, 14, 18, 14, 64, 22, 16, 16, 18, 16, 20, 18, 22, 20, 16, 24, 25, 25].map(wch => ({ wch }));
  rs["!cols"] = [{ wch: 42 }, { wch: 22 }];
  const wb = XLSX.utils.book_new(); wb.Props = { Title: `Vendas Mercado Livre — ${mesAno}` };
  XLSX.utils.book_append_sheet(wb, ws, "Vendas"); XLSX.utils.book_append_sheet(wb, rs, "Resumo");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}