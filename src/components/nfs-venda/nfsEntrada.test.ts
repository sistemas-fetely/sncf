import { describe, expect, it } from "vitest";
import { carregarNfsEntrada, destinoVendaEntrada, filtrarNfsEntrada, ordenarNfsEntrada, resumirNfsEntrada, type NfEntrada } from "./nfsEntrada";

const nota = (patch: Partial<NfEntrada>): NfEntrada => ({ id: "1", numero: null, serie: null, data_emissao: null, emitida_por: "fetely", contraparte: null, contraparte_documento: null, valor: null, natureza_operacao: null, tipo_codigo: null, tipo_rotulo: null, tipo_cor: null, nf_venda_id: null, nf_venda_numero: null, nf_venda_serie: null, nf_venda_valor: null, pct_devolvido: null, vinculo_status: null, pedido_id: null, pedido_ref: null, tem_xml: false, ...patch });
describe("notas de devolução e entrada", () => {
  it("carrega todas as páginas de 1000", async () => {
    const ranges: number[][] = [];
    const rows = await carregarNfsEntrada(async (de, ate) => {
      ranges.push([de, ate]);
      return Array.from({ length: de === 0 ? 1000 : 37 }, (_, i) => nota({ id: String(de + i) }));
    });
    expect(rows).toHaveLength(1037);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });
  it("propaga falha sem retornar dados parciais", async () => {
    await expect(carregarNfsEntrada(async (de) => { if (de) throw new Error("Leitura recusada"); return Array.from({ length: 1000 }, () => nota({})); })).rejects.toThrow("Leitura recusada");
  });
  it("combina emitente, tipo, mês e busca da NF de venda", () => {
    const rows = [nota({ id: "ok", emitida_por: "cliente", tipo_rotulo: "Devolução", data_emissao: "2026-11-12", nf_venda_numero: "42515" }), nota({ id: "outra", emitida_por: "fetely", nf_venda_numero: "42515" })];
    expect(filtrarNfsEntrada(rows, { busca: "42515", emitida: "cliente", tipo: "Devolução", mes: "2026-11" }).map((n) => n.id)).toEqual(["ok"]);
    expect(filtrarNfsEntrada([nota({ contraparte: "CLIENTE ABC" })], { busca: "cliente abc", emitida: "todas", tipo: "todos", mes: "todos" })).toHaveLength(1);
  });
  it.each(["asc", "desc"] as const)("deixa datas vazias no fim em %s", (dir) => {
    const rows = [nota({ id: "vazia" }), nota({ id: "antiga", data_emissao: "2026-10-01" }), nota({ id: "nova", data_emissao: "2026-11-12" })];
    expect(ordenarNfsEntrada(rows, "data_emissao", dir).map((n) => n.id)).toEqual(dir === "desc" ? ["nova", "antiga", "vazia"] : ["antiga", "nova", "vazia"]);
  });
  it("soma devolução somente quando tipo_codigo é devolucao_venda", () => {
    expect(resumirNfsEntrada([nota({ valor: 100, tipo_codigo: "devolucao_venda" }), nota({ valor: 50, tipo_codigo: "entrada" })])).toEqual({ quantidade: 2, valor: 150, devolucao: 100 });
  });
  it("abre vendas buscando o número da NF", () => {
    expect(destinoVendaEntrada("42515")).toBe("/administrativo/contabilidade/nfs-venda?aba=notas&nf_busca=42515");
  });
});