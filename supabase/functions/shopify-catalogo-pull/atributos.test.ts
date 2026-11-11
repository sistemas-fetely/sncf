import { describe, expect, it } from "vitest";
import { atributosProduto, atributosInventory, custoExcedido } from "./atributos";
describe("captura de atributos Shopify", () => {
  it("mapeia produto, coleções e metafields custom sem alterar valores", () => {
    expect(atributosProduto({ id: "gid://shopify/Product/123", descriptionHtml: "<p>Mesa</p>", seo: { title: "Mesa", description: "Festa" }, category: { fullName: "Home > Tableware" }, templateSuffix: "especial", collections: { nodes: [{ title: "Festa" }] }, metafields: { nodes: [{ namespace: "custom", key: "ean", value: "00123" }] } }, "agora")).toEqual({ shopify_id: "123", description_html: "<p>Mesa</p>", seo_title: "Mesa", seo_description: "Festa", category_full_name: "Home > Tableware", template_suffix: "especial", colecoes: ["Festa"], metafields: { "custom.ean": "00123" }, lido_em: "agora" });
  });
  it("vazios ficam nulos/array/objeto, id inválido não grava", () => {
    expect(atributosProduto({ id: "123" }, "hoje")).toMatchObject({ description_html: null, colecoes: [], metafields: {} });
    expect(atributosProduto({ id: "invalido" }, "hoje")).toBeNull();
  });
  it("inventory usa SKU interno e preserva booleanos falsos, código com zero e custo numérico", () => {
    expect(atributosInventory({ id: "gid://shopify/InventoryItem/456", tracked: false, requiresShipping: false, countryCodeOfOrigin: "BR", harmonizedSystemCode: "001234", unitCost: { amount: "12.34", currencyCode: "BRL" } }, "SKU.INTERNO", "hoje")).toEqual({ inventory_item_id: "456", sku: "SKU.INTERNO", tracked: false, requires_shipping: false, country_code_of_origin: "BR", harmonized_system_code: "001234", unit_cost: 12.34, unit_cost_moeda: "BRL", lido_em: "hoje" });
  });
  it("custo zero é zero; ausente ou inválido é nulo", () => {
    expect(atributosInventory({ id: "1", unitCost: { amount: "0" } }, null, "hoje")?.unit_cost).toBe(0);
    expect(atributosInventory({ id: "1" }, null, "hoje")?.unit_cost).toBeNull();
    expect(atributosInventory({ id: "1", unitCost: { amount: "abc" } }, null, "hoje")?.unit_cost).toBeNull();
  });
  it("reduz por custo acima de 1000 ou erro explícito, sem retirar campos", () => {
    expect(custoExcedido({ extensions: { cost: { requestedQueryCost: 1001 } } })).toBe(true);
    expect(custoExcedido({ extensions: { cost: { requestedQueryCost: 1000 } } })).toBe(false);
    expect(custoExcedido({ errors: [{ extensions: { code: "MAX_COST_EXCEEDED" } }] })).toBe(true);
  });
});