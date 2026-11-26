import { describe, expect, it } from "vitest";
import { agruparPorProduto, contarPorCanal, ordenarProdutos, regrasDoProduto, resumoCampos, type LinhaFilaBase } from "./conciliacaoProdutos";

const l = (sku: string, regra: string, extra: Partial<LinhaFilaBase> = {}): LinhaFilaBase => ({
  sku, cod_cadastro: sku.startsWith("handle") ? null : `C-${sku}`, nome_comercial: sku, fase: "ativo", regra,
  onde_resolver: "Bling", campo_matriz: null, valor_matriz: null, valor_destino: null, ...extra,
});

describe("conciliação por produto", () => {
  it("agrupa linhas do mesmo sku numa linha, inclusive anúncio sem produto", () => {
    const g = agruparPorProduto([l("A", "r1"), l("B", "r1"), l("A", "r2"), l("handle-x", "r3"), l("handle-x", "r4")]);
    expect(g.map(p => [p.sku, p.linhas.length])).toEqual([["A", 2], ["B", 1], ["handle-x", 2]]);
    expect(g[2].cod_cadastro).toBeNull();
  });
  it("regra repetida conta uma vez", () => {
    expect(regrasDoProduto(agruparPorProduto([l("A", "r1"), l("A", "r1"), l("A", "r2")])[0]).map(x => x.regra)).toEqual(["r1", "r2"]);
  });
  it("campos: campos_diferentes usa o valor da matriz; demais matriz → destino", () => {
    expect(resumoCampos([l("A", "r1", { campo_matriz: "campos_diferentes", valor_matriz: "Nome · EAN" }), l("A", "r2", { valor_matriz: "10", valor_destino: "12" })])).toBe("Nome · EAN · 10 → 12");
  });
  it("ordena por quantidade de divergências", () => {
    const g = agruparPorProduto([l("A", "r1"), l("B", "r1"), l("B", "r2")]);
    expect(ordenarProdutos(g, "divergencias", "desc").map(p => p.sku)).toEqual(["B", "A"]);
  });
  it("canal conta produtos distintos e divergências", () => {
    const c = contarPorCanal([l("A", "r1"), l("A", "r2"), l("B", "r1"), l("C", "r1", { onde_resolver: "XPM" })]);
    expect(c.get("Bling")).toEqual({ produtos: 2, divergencias: 3 });
    expect(c.get("XPM")).toEqual({ produtos: 1, divergencias: 1 });
  });
});
