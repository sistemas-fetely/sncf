// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { montarClientesAberto, xlsxClientesAberto } from "./clientes-aberto.ts";

const titulo = (id: string, extra: any = {}) => ({ id, cliente: "Cliente A", parceiro_id: "a", numero_titulo: id, numero_parcela: 1, total_parcelas: 2, pedido_ref: "PED-1", nf_numero: "141", data_compra: "2026-10-01", data_vencimento: "2026-10-31", valor: 10, meio_pagamento: "boleto", estado_rotulo: "Recebido", data_recebimento: null, ...extra });
function adminFake(linhas: any[], erro?: string, erroDoc?: string) {
  const chamadas: any[] = [];
  const admin = { from: (tabela: string) => {
    const q: any = {};
    for (const metodo of ["select", "lte", "eq", "or", "order"]) q[metodo] = (...args: any[]) => { chamadas.push([tabela, metodo, ...args]); return q; };
    q.range = async (de: number, ate: number) => { chamadas.push([tabela, "range", de, ate]); return { data: linhas.slice(de, ate + 1), error: erro ? new Error(erro) : null }; };
    q.in = async (_col: string, ids: string[]) => { chamadas.push([tabela, "in", ...ids]); return { data: ids.map(id => ({ id, parceiro_cnpj: "63591078000148", parceiro_razao_social: "Razão A" })), error: erroDoc ? new Error(erroDoc) : null }; };
    return q;
  } };
  return { admin, chamadas };
}
Deno.test("regra histórica aplicada no PostgREST com posição 31/10", async () => {
  const { admin, chamadas } = adminFake([]);
  const dados = await montarClientesAberto(admin, "2026-10-31");
  assertEquals(chamadas.filter(c => ["lte", "eq", "or"].includes(c[1])), [["vw_recebivel_b2b", "lte", "data_compra", "2026-10-31"], ["vw_recebivel_b2b", "eq", "estado_terminal", false], ["vw_recebivel_b2b", "or", "estado_em_aberto.eq.true,data_recebimento.gt.2026-10-31"]]);
  assertEquals(dados.qtd, 0); assertEquals(dados.total, 0); assertEquals(dados.clientes, 0);
});
Deno.test("vencido estritamente antes do fim, dias históricos e recebido depois informativo", async () => {
  const { admin } = adminFake([titulo("1", { data_vencimento: "2026-10-30", valor: 20.25, data_recebimento: "2026-11-05" }), titulo("2"), titulo("3", { cliente: "Cliente B", parceiro_id: "b", valor: 50, data_vencimento: "2026-11-02" })]);
  const d = await montarClientesAberto(admin, "2026-10-31");
  assertEquals([d.qtd, d.total, d.qtd_vencidos, d.total_vencido, d.clientes], [3, 80.25, 1, 20.25, 2]);
  assertEquals(d.titulos.map(t => [t.situacao, t.dias_atraso, t.recebido_depois]), [["vencido", 1, true], ["a_vencer", 0, false], ["a_vencer", 0, false]]);
  assertEquals(d.por_cliente.map(g => [g.cliente, g.qtd, g.total, g.vencido, g.qtd_vencidos, g.maior_atraso]), [["Cliente B", 1, 50, 0, 0, 0], ["Cliente A", 2, 30.25, 20.25, 1, 1]]);
});
Deno.test("pagina títulos de 1000 e enriquece CNPJ em lotes de 200", async () => {
  const { admin, chamadas } = adminFake(Array.from({ length: 1001 }, (_, i) => titulo(String(i))));
  const d = await montarClientesAberto(admin, "2026-10-31");
  assertEquals(d.qtd, 1001); assertEquals(d.total, 10010);
  assertEquals(chamadas.filter(c => c[1] === "range").map(c => c.slice(2)), [[0, 999], [1000, 1999]]);
  assertEquals(chamadas.filter(c => c[1] === "in").map(c => c.length - 2), [200, 200, 200, 200, 200, 1]);
  assertEquals(d.titulos.at(-1)?.cnpj, "63591078000148");
});
Deno.test("erros de títulos e CNPJ lançam em vez de relatório vazio", async () => {
  await assertRejects(() => montarClientesAberto(adminFake([], "consulta negada").admin, "2026-10-31"), Error, "consulta negada");
  await assertRejects(() => montarClientesAberto(adminFake([titulo("1")], undefined, "CNPJ indisponível").admin, "2026-10-31"), Error, "CNPJ indisponível");
});
Deno.test("valores arredondados a duas casas e parceiros distintos não agrupam por nome", async () => {
  const d = await montarClientesAberto(adminFake([titulo("1", { valor: 10.234 }), titulo("2", { parceiro_id: "b", valor: 20.236 })]).admin, "2026-10-31");
  assertEquals(d.titulos.map(t => t.valor), [10.23, 20.24]); assertEquals(d.total, 30.47); assertEquals(d.clientes, 2); assertEquals(d.por_cliente.length, 2);
});
Deno.test("XLSX preserva títulos, recebimento posterior e totais nas duas abas", async () => {
  const d = await montarClientesAberto(adminFake([titulo("1", { data_vencimento: "2026-10-30", valor: 20.25, data_recebimento: "2026-11-05" }), titulo("2")]).admin, "2026-10-31");
  const wb = XLSX.read(xlsxClientesAberto(d, "10/2026"), { type: "array", cellFormula: true });
  assertEquals(wb.SheetNames, ["Titulos em aberto", "Resumo por cliente"]);
  const ws = wb.Sheets["Titulos em aberto"], rs = wb.Sheets["Resumo por cliente"];
  assertEquals(ws.C5.v, 2); assertEquals(ws.J5.v, 30.25); assertEquals(rs.C3.v, 2); assertEquals(rs.D3.v, 30.25); assertEquals(rs.E3.v, 20.25); assertEquals(rs.F3.v, 1);
  assertEquals(ws.J5.f, "SUM(J3:J4)"); assertEquals(rs.D3.f, "SUM(D2:D2)");
});