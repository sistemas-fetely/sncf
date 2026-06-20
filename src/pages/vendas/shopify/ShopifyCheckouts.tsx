import { ShopifyListPage, fmtDate, txt } from "./_ShopifyListPage";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function ShopifyCheckouts() {
  return (
    <ShopifyListPage
      titulo="Checkouts Shopify"
      table="shopify_checkouts"
      orderBy={{ column: "created_at_shopify", ascending: false }}
      searchFields={["name", "email"]}
      columns={[
        { header: "Name", cell: (r) => txt(r.name) },
        { header: "E-mail", cell: (r) => txt(r.email) },
        { header: "Total", cell: (r) => r.total_price != null ? BRL.format(Number(r.total_price)) : "—" },
        { header: "Moeda", cell: (r) => txt(r.currency) },
        { header: "Status", cell: (r) => r.completed_at ? fmtDate(r.completed_at) : <span className="text-amber-600">Abandonado</span> },
        { header: "Criado em", cell: (r) => fmtDate(r.created_at_shopify) },
      ]}
      detailFields={["customer", "line_items", "shipping_address", "discount_codes"]}
    />
  );
}
