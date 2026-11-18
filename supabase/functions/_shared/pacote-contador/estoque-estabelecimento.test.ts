// deno-lint-ignore-file no-explicit-any require-await
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as XLSX from "npm:xlsx@0.18.5";
import { montarEstoqueEstabelecimento, xlsxEstoqueEstabelecimento } from "./estoque-estabelecimento.ts";
const centros = [
  { id: "sp", codigo: "SITE-SP", uf: "SP", cnpj_emitente: "63591078000148", participante_cnpj: "63591078000148" },
  { id: "sr", codigo: "FET-SP-SR", uf: "SP", centro_fiscal_id: "sp", participante_cnpj: "63591078000148" },
  { id: "sc", codigo: "XPM-SC", uf: "SC", cnpj_emitente: "63591078000229", participante_cnpj: "63591078000229" },
  { id: "util", codigo: "CONSIG-UTILPLAST", uf: "SP", participante_cnpj: "43367390000498" },
];
const db = (cs = centros) => ({ from: () => { const q: any = { select: () => q, order: () => q, range: async () => ({ data: cs, error: null }) }; return q; } });
const linha = (centro: string, quantidade: number, valor_total: number) => ({ centro, quantidade, valor_total, codigo_produto: "02029", sku: "CL-EH-BWL-16-HAL", produto: "Bowl", unidade: "UN", ncm: "39241000", participante_cnpj: null, participante_nome: centro === "CONSIG-UTILPLAST" ? "Utilplast" : null });
Deno.test("SITE-SP e FET-SP-SR consolidam o mesmo código como próprio", async () => {
  const d = await montarEstoqueEstabelecimento(db(), [linha("SITE-SP", 50, 100), linha("FET-SP-SR", 25, 75)]);
  assertEquals(d.linhas.length, 1); assertEquals([d.linhas[0].quantidade, d.linhas[0].valor_total, d.linhas[0].valor_unitario, d.linhas[0].participante_cnpj], [75, 175, 2.333333, ""]);
});
Deno.test("mesmo código no XPM-SC pertence à Filial", async () => {
  const d = await montarEstoqueEstabelecimento(db(), [linha("SITE-SP", 75, 175), linha("XPM-SC", 380, 760)]);
  assertEquals(d.resumo.map(r => [r.cnpj, r.quantidade]), [["63591078000148", 75], ["63591078000229", 380]]);
});
Deno.test("consignado externo mantém linha própria e participante", async () => {
  const d = await montarEstoqueEstabelecimento(db(), [linha("SITE-SP", 2, 4), linha("CONSIG-UTILPLAST", 3, 6)]);
  assertEquals(d.linhas.map(l => [l.cnpj, l.participante_cnpj, l.quantidade]), [["63591078000148", "", 2], ["63591078000148", "43367390000498", 3]]);
});
Deno.test("centro sem estabelecimento recusa com seu código", async () => {
  await assertRejects(() => montarEstoqueEstabelecimento(db(), [linha("SEM-CENTRO", 1, 1)]), Error, "SEM-CENTRO sem estabelecimento resolvível");
});
Deno.test("xlsx preserva códigos/CNPJs textuais e seis casas no custo", async () => {
  const d = await montarEstoqueEstabelecimento(db(), [linha("SITE-SP", 75, 175), linha("XPM-SC", 380, 760), linha("CONSIG-UTILPLAST", 3, 6)]);
  const w = XLSX.read(xlsxEstoqueEstabelecimento(d, "10/2026"), { type: "array", cellNF: true });
  assertEquals(w.SheetNames, ["Resumo", "Matriz SP", "Filial SC", "Detalhe por local"]);
  assertEquals(w.Sheets.Resumo.A1.v, "Posição de estoque em 31/10/2026 (Bloco K)");
  assertEquals(w.Sheets["Matriz SP"].A2.v, "02029"); assertEquals(w.Sheets["Matriz SP"].G2.z, "#,##0.000000");
  assertEquals(w.Sheets["Matriz SP"].J3.v, "43.367.390/0004-98");
  assertEquals(w.Sheets.Resumo.E5.v, 941); assertEquals(w.Sheets.Resumo.E5.f, "SUM(E3:E4)");
});