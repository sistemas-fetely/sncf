import { ShopifyListPage, fmtDate, txt } from "./_ShopifyListPage";

export default function ShopifyClientes() {
  return (
    <ShopifyListPage
      titulo="Clientes Shopify"
      table="shopify_clientes"
      orderBy={{ column: "created_at_shopify", ascending: false }}
      searchFields={["first_name", "last_name", "email", "phone"]}
      columns={[
        { header: "Nome", cell: (r) => txt(r.first_name) },
        { header: "Sobrenome", cell: (r) => txt(r.last_name) },
        { header: "E-mail", cell: (r) => txt(r.email) },
        { header: "Telefone", cell: (r) => txt(r.phone) },
        { header: "Estado", cell: (r) => txt(r.state) },
        { header: "Criado em", cell: (r) => fmtDate(r.created_at_shopify) },
      ]}
      detailFields={["addresses", "default_address"]}
    />
  );
}
