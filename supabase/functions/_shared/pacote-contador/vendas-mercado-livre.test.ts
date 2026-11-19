// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { montarVendasMercadoLivre, xlsxVendasMercadoLivre } from "./vendas-mercado-livre.ts";
const linhas = [{"venda_id": "c57aa20f-d77e-40a0-8a46-f558297d5855", "pedido": "ML-0001", "nf_numero": "000126", "nf_data": "2026-11-10", "nf_valor": 19.9, "data_venda": "2026-11-10", "item": "\"\"Prato Sobremesa Fungi Royale Verde - 15cm - 6un - Fetély Verde\"\"", "bruto_mercado_pago": 19.9, "comissao": 3.32, "frete": 7.15, "parcelamento": 0.06, "impostos": 0.0, "tarifas": 10.53, "liquido": 9.37, "diferenca_bruto_nf": 0.0, "liberacao_prevista": "2026-11-24", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019462637558", "pagamento_mercado_pago": "187850157613"}, {"venda_id": "8f017538-0237-471a-98b7-5281fede4b22", "pedido": "ML-0002", "nf_numero": "000137", "nf_data": "2026-11-16", "nf_valor": 27.9, "data_venda": "2026-11-15", "item": "\"\"Prato Casinha Fairytale - 22cm - 6un - Fetély Multicolorido\"\"", "bruto_mercado_pago": 27.9, "comissao": 3.35, "frete": 6.95, "parcelamento": 0.0, "impostos": 0.0, "tarifas": 10.3, "liquido": 17.6, "diferenca_bruto_nf": 0.0, "liberacao_prevista": "2026-11-29", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019569191366", "pagamento_mercado_pago": "188746010499"}, {"venda_id": "5eff34d9-8a29-4388-a8f9-5b50a543536c", "pedido": "ML-0003", "nf_numero": "000142", "nf_data": "2026-11-17", "nf_valor": 79.8, "data_venda": "2026-11-16", "item": "\"\"Travessa Retangular Piacera - 30cm - 4un - Fetély Branco E Dourado\"\"", "bruto_mercado_pago": 79.8, "comissao": 9.18, "frete": 14.9, "parcelamento": 0.0, "impostos": 0.0, "tarifas": 24.08, "liquido": 55.72, "diferenca_bruto_nf": 0.0, "liberacao_prevista": "2026-12-15", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019580824894", "pagamento_mercado_pago": "188817782451"}, {"venda_id": "219077d7-f6aa-4ba7-9014-4800b979f0b1", "pedido": "ML-0006", "nf_numero": "000153", "nf_data": "2026-11-18", "nf_valor": 25.8, "data_venda": "2026-11-17", "item": "\"\"Vela Frost Glow Amarela Nº 3 - 7cm - 1un - Fetély\"\"", "bruto_mercado_pago": 25.8, "comissao": 3.03, "frete": 11.3, "parcelamento": 0.07, "impostos": 0.0, "tarifas": 14.4, "liquido": 11.4, "diferenca_bruto_nf": 0.0, "liberacao_prevista": "2026-12-16", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019629200990", "pagamento_mercado_pago": "190255752122"}, {"venda_id": "25ae8f44-1ccd-4d84-a767-ee04443c30be", "pedido": "ML-0004", "nf_numero": "000145", "nf_data": "2026-11-17", "nf_valor": 60.89, "data_venda": "2026-11-17", "item": "\"\"Jogo Americano Ondée Azul - 41cm - 6un - Fetély Azul Listras Verticais E Bordas Onduladas\"\"", "bruto_mercado_pago": 67.47, "comissao": 5.74, "frete": 19.44, "parcelamento": 6.58, "impostos": 0.0, "tarifas": 31.76, "liquido": 35.71, "diferenca_bruto_nf": 6.58, "liberacao_prevista": "2026-12-16", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019609511798", "pagamento_mercado_pago": "189009599161"}, {"venda_id": "0921a8a6-d646-42ed-a937-2f9c432c3bd5", "pedido": "ML-0005", "nf_numero": "000144", "nf_data": "2026-11-17", "nf_valor": 60.89, "data_venda": "2026-11-17", "item": "\"\"Jogo Americano Ondée Colorido - 41cm - 6un - Fetély Colorido Listras Verticais E Bordas Onduladas\"\"", "bruto_mercado_pago": 67.47, "comissao": 5.74, "frete": 19.44, "parcelamento": 6.58, "impostos": 0.0, "tarifas": 31.76, "liquido": 35.71, "diferenca_bruto_nf": 6.58, "liberacao_prevista": "2026-12-16", "liberado_em": null, "valor_liberado": null, "situacao": "A liberar", "pedido_mercado_livre": "2000019609524112", "pagamento_mercado_pago": "189009443133"}];
function fake(rows: any[], erro?: string) {
 const chamadas: any[] = []; const q: any = {};
 for (const m of ["select", "eq", "order"]) q[m] = (...args: any[]) => { chamadas.push([m, ...args]); return q; };
 q.range = async (de: number, ate: number) => ({data: rows.slice(de, ate+1),error: erro ? new Error(erro):null});
 return { db: {from: (t: string) => { chamadas.push(["from",t]); return q; }}, chamadas };
}
Deno.test("Mercado Livre: seis vendas novembro e todos os totais de referência", async () => {
 const d=await montarVendasMercadoLivre(fake(linhas).db,"2026-11-01");
 assertEquals(d.resumo,{qtd:6,total_nf:275.18,bruto:288.34,tarifas:122.83,comissao:30.36,frete:79.18,parcelamento:13.29,liquido:165.51,liquido_liberado:0,liquido_a_liberar:165.51,sem_nf:0,sem_pedido:0});
 assertEquals([d.diferenca,d.impostos],[13.16,0]);
});
Deno.test("Mercado Livre: fonte única com competência e paginação completa", async () => {
 const {db,chamadas}=fake(Array.from({length:1001},(_,i)=>({...linhas[0],venda_id:String(i)})));
 assertEquals((await montarVendasMercadoLivre(db,"2026-11-01")).resumo.qtd,1001);
 assertEquals(chamadas[0],["from","vw_contabil_vendas_mercado_livre"]);
 assertEquals(chamadas[2],["eq","competencia","2026-11-01"]);
});
Deno.test("Mercado Livre: mês vazio registra zero", async () => {
 const d=await montarVendasMercadoLivre(fake([]).db,"2026-10-01");
 assertEquals(Object.values(d.resumo),Array(12).fill(0));
});
Deno.test("Mercado Livre: liberado usa líquido e separa sem NF e sem pedido", async () => {
 const d=await montarVendasMercadoLivre(fake([{...linhas[0],situacao:"Liberado",valor_liberado:1},{...linhas[1],situacao:"Sem pedido no SNCF",nf_numero:null,nf_valor:null,diferenca_bruto_nf:null}]).db,"2026-11-01");
 assertEquals([d.resumo.liquido_liberado,d.resumo.liquido_a_liberar,d.resumo.sem_nf,d.resumo.sem_pedido],[9.37,17.6,1,1]);
});
Deno.test("Mercado Livre: falhas de leitura e números inválidos não viram relatório vazio", async () => {
 await assertRejects(()=>montarVendasMercadoLivre(fake([],"leitura negada").db,"2026-11-01"),Error,"leitura negada");
 await assertRejects(()=>montarVendasMercadoLivre(fake([{...linhas[0],liquido:"erro"}]).db,"2026-11-01"),Error,"liquido inválido");
 await assertRejects(()=>montarVendasMercadoLivre(fake([]).db,"2026-13-01"),Error,"competência inválida");
});
Deno.test("Mercado Livre: duas abas, dinheiro numérico, datas e total final", async () => {
 const d=await montarVendasMercadoLivre(fake(linhas).db,"2026-11-01");
 const wb=XLSX.read(xlsxVendasMercadoLivre(d,"11/2026"),{type:"array",cellDates:true,cellNF:true});
 assertEquals(wb.SheetNames,["Vendas","Resumo"]);
 const w=wb.Sheets.Vendas,r=wb.Sheets.Resumo;
 assertEquals([w.D3.t,w.D3.v,w.D3.z],["n",19.9,"#,##0.00"]);
 assertEquals([w.C3.t,w.C3.v.toISOString().slice(0,10),w.C3.z],["d","2026-11-10","dd/mm/yyyy"]);
 assertEquals([w.A9.v,w.D9.v,w.G9.v,w.L9.v,w.M9.v,w.N9.v],["TOTAL",275.18,288.34,122.83,165.51,13.16]);
 assertEquals(w.G9.f,"SUM(G3:G8)");
 assertEquals([r.B3.v,r.B4.v,r.B13.v,r.B14.v,r.B15.v,r.B16.v],[6,275.18,0,165.51,0,0]);
 assertEquals(r.B3.t,"n"); assertEquals(r.B14.z,"#,##0.00");
 assertEquals(w.R3.t,"s"); assertEquals(w.S3.t,"s");
});
