// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { montarVendasPlataforma, xlsxVendasPlataforma } from "./vendas-plataforma.ts";

const nf = (n: number, canal: string, valor: number, extra: any = {}) => ({ nf_id: `id${n}`, competencia: "2026-10-01", numero: String(n), serie: "1", data_emissao: "2026-10-05", estabelecimento: "Site SP", cliente: "C", tipo_cliente: "PF", valor_nota: valor, canal, pedido: "P", meio_pagamento: "pix", ...extra });
function fake(linhas: any[], erro?: string) {
  const chamadas: any[] = [];
  const db = { from: (t: string) => { const q: any = {};
    for (const m of ["select", "eq", "order"]) q[m] = (...a: any[]) => { chamadas.push([t, m, ...a]); return q; };
    q.range = async (de: number, ate: number) => ({ data: linhas.slice(de, ate + 1), error: erro ? new Error(erro) : null });
    return q; } };
  return { db, chamadas };
}
Deno.test("filtra a competência e ordena por emissão e número", async () => {
  const { db, chamadas } = fake([]);
  await montarVendasPlataforma(db, "2026-10-01");
  assertEquals(chamadas.filter(c => c[1] !== "select"), [["vw_contabil_vendas_plataforma", "eq", "competencia", "2026-10-01"], ["vw_contabil_vendas_plataforma", "order", "data_emissao"], ["vw_contabil_vendas_plataforma", "order", "numero"]]);
});
Deno.test("total de vendas exclui transferências e elas vão por último", async () => {
  const { db } = fake([nf(1, "Transferência entre CDs", 1000), nf(2, "Shopify", 100.1), nf(3, "Outros / sem vínculo", 5), nf(4, "Shopify", 50, { tipo_cliente: "PJ" })]);
  const d = await montarVendasPlataforma(db, "2026-10-01");
  assertEquals([d.qtd, d.total, d.total_vendas], [4, 1155.1, 155.1]);
  assertEquals(d.por_canal.map(c => [c.canal, c.qtd, c.total]), [["Shopify", 2, 150.1], ["Outros / sem vínculo", 1, 5], ["Transferência entre CDs", 1, 1000]]);
  assertEquals(d.por_meio.filter(m => m.canal === "Shopify").map(m => m.tipo_cliente), ["PF", "PJ"]);
});
Deno.test("paginação de 1000 em 1000", async () => {
  const { db } = fake(Array.from({ length: 1500 }, (_, i) => nf(i, "Shopify", 1)));
  assertEquals((await montarVendasPlataforma(db, "2026-10-01")).qtd, 1500);
});
Deno.test("fail-loud em erro e valor inválido", async () => {
  await assertRejects(() => montarVendasPlataforma(fake([], "boom").db, "2026-10-01"), Error, "boom");
  await assertRejects(() => montarVendasPlataforma(fake([nf(1, "Shopify", null as any)]).db, "2026-10-01"), Error, "sem valor");
});
Deno.test("xlsx com três abas, título e totais", async () => {
  const d = await montarVendasPlataforma(fake([nf(1, "Shopify", 10), nf(2, "Transferência X", 3)]).db, "2026-10-01");
  const wb = XLSX.read(xlsxVendasPlataforma(d, "10/2026"), { type: "array" });
  assertEquals(wb.SheetNames, ["NFs por plataforma", "Resumo por plataforma", "Plataforma x meio"]);
  const a = wb.Sheets["NFs por plataforma"];
  assertEquals(a.A1.v, "Vendas por plataforma — 10/2026 (NFs de saída autorizadas)");
  assertEquals([a.C3.v, a.A5.v, a.G5.v], ["05/10/2026", "TOTAL", 13]);
  const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets["Resumo por plataforma"], { header: 1 });
  assertEquals(r.at(-1), ["TOTAL VENDAS (sem transferências)", 1, 10]);
});
