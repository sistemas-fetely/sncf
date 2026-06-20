import { ShopifyListPage, fmtDate, txt } from "./_ShopifyListPage";

export default function ShopifyReembolsos() {
  return (
    <ShopifyListPage
      titulo="Reembolsos Shopify"
      table="shopify_reembolsos"
      orderBy={{ column: "created_at_shopify", ascending: false }}
      searchFields={["shopify_id", "order_id"]}
      columns={[
        { header: "Shopify ID", cell: (r) => txt(r.shopify_id) },
        { header: "Pedido", cell: (r) => txt(r.order_id) },
        { header: "Restock", cell: (r) => r.restock ? "Sim" : "Não" },
        { header: "Processado", cell: (r) => fmtDate(r.processed_at) },
        { header: "Criado em", cell: (r) => fmtDate(r.created_at_shopify) },
      ]}
      detailFields={["refund_line_items", "transactions"]}
    />
  );
}
