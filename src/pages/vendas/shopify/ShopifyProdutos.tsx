import { ShopifyListPage, fmtDate, txt } from "./_ShopifyListPage";

export default function ShopifyProdutos() {
  return (
    <ShopifyListPage
      titulo="Produtos Shopify"
      table="shopify_produtos"
      orderBy={{ column: "updated_at_shopify", ascending: false }}
      searchFields={["title", "handle", "vendor", "product_type"]}
      columns={[
        { header: "Título", cell: (r) => txt(r.title) },
        { header: "Handle", cell: (r) => txt(r.handle) },
        { header: "Status", cell: (r) => txt(r.status) },
        { header: "Tipo", cell: (r) => txt(r.product_type) },
        { header: "Vendor", cell: (r) => txt(r.vendor) },
        { header: "Atualizado", cell: (r) => fmtDate(r.updated_at_shopify) },
      ]}
      detailFields={["variants", "options", "images"]}
    />
  );
}
