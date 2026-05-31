import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RecebimentoLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabAtiva = pathname.includes("/recebimento/aguardando-pagamento")
    ? "aguardando_pagamento"
    : "cobranca";

  const handleTabChange = (v: string) => {
    if (v === "aguardando_pagamento") {
      navigate("/recebimento/aguardando-pagamento");
    } else if (v === "pedidos_venda") {
      navigate("/pedidos");
    } else {
      navigate("/recebimento/cobranca");
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Vendas" },
        ]}
        title="Vendas"
        subtitle="Cobrança da entrada, confirmação de pagamento e pedidos de venda"
      />

      <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
          <TabsTrigger
            value="cobranca"
            className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
          >
            Cobrança
          </TabsTrigger>
          <TabsTrigger
            value="aguardando_pagamento"
            className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
          >
            Aguardando pagamento
          </TabsTrigger>
          <TabsTrigger
            value="pedidos_venda"
            className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
          >
            Pedidos de Venda
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="mt-4">
        <Outlet />
      </div>
    </div>
  );
}
