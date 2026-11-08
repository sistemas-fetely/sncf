import { describe, expect, it } from "vitest";
import { montarFilaOperacional, cargaParadosXpm, skusDoCard, urlDevolucoesProduto, type AlertaProduto } from "./filaOperacionalEstoque";
import { agrupar, type LinhaCentral } from "./centralEstoque";
import type { ReposicaoSp } from "./reposicaoSp";
const alerta = (sku: string, dados: Partial<AlertaProduto> = {}) => ({ sku, ...dados }) as AlertaProduto;
describe("fila operacional única", () => {
  it("link busca SKU e inclui devoluções finalizadas pelo codec existente", () => {
    const url = new URL(urlDevolucoesProduto("A/B"), "https://example.test");
    expect(url.searchParams.get("q")).toBe("A/B"); expect(url.searchParams.get("fin")).toBe("1");
  });
  it("conta SKU uma vez nos cards antigos mesmo com dois CDs", () => {
    const linha = { sku: "A", papel: "avancado", status: "acabando" } as LinhaCentral;
    const produtos = agrupar([{ ...linha, centro: "SP" }, { ...linha, centro: "SR" }]).produtos;
    expect(montarFilaOperacional(produtos, [], []).skus.acabando.size).toBe(1);
  });
  it("soma custo só de parados XPM", () => {
    const f = montarFilaOperacional([], [], [alerta("A", { parado_xpm: true, custo_posicao_mes: 15.5 }), alerta("B", { parado_xpm: true, custo_posicao_mes: 8 }), alerta("C", { custo_posicao_mes: 100 })]);
    expect(f.custoPosicao).toBe(23.5); expect([...f.skus.parado_xpm]).toEqual(["A", "B"]);
  });
  it("sem giro soma saldo_rede apenas das linhas sinalizadas", () => {
    const f = montarFilaOperacional([], [], [alerta("A", { sem_giro: true, saldo_rede: 12 }), alerta("B", { sem_giro: true, saldo_rede: 3 }), alerta("C", { saldo_rede: 99 })]);
    expect(f.unidadesParadas).toBe(15);
  });
  it("devolução alta segue booleano da view sem recalcular taxa", () => {
    const f = montarFilaOperacional([], [], [alerta("A", { devolucao_alta: true, taxa_devolucao_pct: 1 }), alerta("B", { devolucao_alta: false, taxa_devolucao_pct: 99 })]);
    expect([...f.skus.devolucao_alta]).toEqual(["A"]);
  });
  it("repor inclui ritmos não nulos e mantém todos os cards zerados", () => {
    const f = montarFilaOperacional([], [{ sku: "A", ritmo: "urgente" }, { sku: "B", ritmo: "carga" }, { sku: "C", ritmo: null }] as ReposicaoSp[], []);
    expect([...f.skus.repor]).toEqual(["A", "B"]); expect(Object.keys(f.skus)).toHaveLength(10); expect(skusDoCard(f, "sem_giro")?.size).toBe(0);
  });
  it("trazer tudo pré-carrega disp_xpm, não saldo nem reservas", () => {
    const carga = cargaParadosXpm([alerta("A", { parado_xpm: true, disp_xpm: 7, saldo_xpm: 20, res_xpm: 13 }), alerta("B", { parado_xpm: true, disp_xpm: 0 }), alerta("C", { disp_xpm: 30 })]);
    expect(carga?.itens).toEqual([{ sku: "A", nome: "", quantidade: 7 }]); expect(carga?.aba).toBe("carga");
  });
});