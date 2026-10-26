import { describe, expect, it } from "vitest";
import { reagregarProdutoPorSkuCanal } from "./reagregarProduto";

const base = { mes: "2026-09-01", produto: "Vela", colecao: null, linha: null, grupo: null, cor_nome: null, sku_sem_cadastro: false, sem_custo: false, custo_unit: 5, custo_safra: null, margem_pct: null, preco_medio_un: null, clientes: 1, receita_frete: 0, icms: 0 };

describe("reagregarProdutoPorSkuCanal", () => {
  it("mesma SKU em XPM SC e Site SP vira uma linha com totais somados", () => {
    const r = reagregarProdutoPorSkuCanal([
      { ...base, canal: "B2C", sku: "A", estabelecimento: "XPM SC", unidades: 2, receita_produto: 100, cmv: 10, margem: 80, nfs: 2 },
      { ...base, canal: "B2C", sku: "A", estabelecimento: "Site SP", unidades: 3, receita_produto: 200, cmv: 15, margem: 170, nfs: 1 },
      { ...base, canal: "B2B", sku: "A", estabelecimento: "XPM SC", unidades: 1, receita_produto: 50, cmv: 5, margem: 40, nfs: 1 },
    ] as never);
    expect(r).toHaveLength(2);
    const b2c = r.find((x) => x.canal === "B2C")!;
    expect(b2c.unidades).toBe(5);
    expect(b2c.receita_produto).toBe(300);
    expect(b2c.margem).toBe(250);
    expect(b2c.nfs).toBe(3);
    expect(b2c.preco_medio_un).toBe(60);
  });
});
