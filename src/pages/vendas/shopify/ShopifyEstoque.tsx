import { ShopifyListPage, fmtDate, txt } from "./_ShopifyListPage";

export default function ShopifyEstoque() {
  return (
    <ShopifyListPage
      titulo="Estoque Shopify"
      table="shopify_estoque"
      orderBy={{ column: "updated_at_shopify", ascending: false }}
      searchFields={["inventory_item_id", "location_id"]}
      columns={[
        { header: "Inventory Item", cell: (r) => txt(r.inventory_item_id) },
        { header: "Location", cell: (r) => txt(r.location_id) },
        { header: "Disponível", cell: (r) => txt(r.available) },
        { header: "Atualizado", cell: (r) => fmtDate(r.updated_at_shopify) },
      ]}
      detailFields={[]}
    />
  );
}
