import { ShopifyListPage, txt } from "./_ShopifyListPage";

export default function ShopifyFulfillments() {
  return (
    <ShopifyListPage
      titulo="Fulfillments Shopify"
      table="shopify_fulfillments"
      searchFields={["shopify_id", "order_id", "tracking_number", "tracking_company"]}
      columns={[
        { header: "Shopify ID", cell: (r) => txt(r.shopify_id) },
        { header: "Pedido", cell: (r) => txt(r.order_id) },
        { header: "Status", cell: (r) => txt(r.status) },
        { header: "Envio", cell: (r) => txt(r.shipment_status) },
        { header: "Transportadora", cell: (r) => txt(r.tracking_company) },
        { header: "Rastreio", cell: (r) => txt(r.tracking_number) },
        {
          header: "URL",
          cell: (r) => r.tracking_url
            ? <a href={r.tracking_url} target="_blank" rel="noreferrer" className="text-primary underline">link</a>
            : "—",
        },
      ]}
      detailFields={["line_items", "destination"]}
    />
  );
}
