import { describe, expect, it } from "vitest";
import { consolidarItensPorProduto, itensConsolidadosParaConferencia } from "./consolidarItensPorProduto";
import type { ItemPedidoMesa } from "./tipos";
const item = (id: string, quantidade: number, props: Partial<ItemPedidoMesa> = {}): ItemPedidoMesa => ({
  id, quantidade, sku: "02047", cod_cadastro: "02047", descricao: "Bowl", ean: "7891234567890", ...props,
});
describe("Mesa SP — consolidar produtos", () => {
  it("SHP-1675: Bowl 2+3 aparece uma vez com 5 e o pedido mantém 13 peças", () => {
    const linhas = [item("a", 2), item("b", 3), item("c", 8, { sku: "outro" })];
    const antes = structuredClone(linhas);
    const r = consolidarItensPorProduto(linhas);
    expect(r).toHaveLength(2);
    expect(r[0].quantidade).toBe(5);
    expect(r.reduce((s, i) => s + i.quantidade, 0)).toBe(13);
    expect(r[0].linhas_origem).toEqual([{ id: "a", qtd: 2 }, { id: "b", qtd: 3 }]);
    expect(linhas).toEqual(antes);
  });
  it("produto_id tem precedência sobre SKU/EAN e produtos distintos não se misturam", () => {
    const r = consolidarItensPorProduto([item("a", 2, { produto_id: "p" }), item("b", 3, { produto_id: "p", sku: "alternativo" }), item("c", 1, { produto_id: "q" })]);
    expect(r.map(i => i.quantidade)).toEqual([5, 1]);
  });
  it("fallback SKU, código e EAN; sem identidade preserva linhas separadas", () => {
    expect(consolidarItensPorProduto([item("a", 2, { sku: "abc" }), item("b", 3, { sku: "ABC" })])).toHaveLength(1);
    expect(consolidarItensPorProduto([item("a", 2, { sku: null }), item("b", 3, { sku: null })])[0].quantidade).toBe(5);
    expect(consolidarItensPorProduto([item("a", 2, { sku: null, cod_cadastro: null }), item("b", 3, { sku: null, cod_cadastro: null, ean: "07891234567890" })])[0].quantidade).toBe(5);
    expect(consolidarItensPorProduto([item("a", 2, { sku: null, cod_cadastro: null, ean: null }), item("b", 3, { sku: null, cod_cadastro: null, ean: null })])).toHaveLength(2);
  });
  it("payload de sucesso e divergência conserva origens e contagem consolidada", () => {
    const r = consolidarItensPorProduto([item("a", 2), item("b", 3)]);
    const ok = itensConsolidadosParaConferencia(r, { a: 5 });
    expect(ok[0]).toMatchObject({ esperado: 5, bipado: 5, linhas_origem: [{ id: "a", qtd: 2 }, { id: "b", qtd: 3 }] });
    expect(itensConsolidadosParaConferencia(r, { a: 2 })[0].bipado).toBe(2);
  });
  it("pedido sem repetição preserva ordem e todos os campos visuais", () => {
    const linhas = [item("a", 2), item("b", 3, { sku: "outro" })];
    expect(consolidarItensPorProduto(linhas).map(({ linhas_origem, ...i }) => i)).toEqual(linhas);
  });
});