import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RecebimentoLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleTabChange = (v: string) => {
    if (v === "parceiros") {
      navigate("/administrativo-fetely/parceiros");
    } else {
      navigate("/pedidos");
    }
  };

  // Suprime as tabs de nível superior quando estiver dentro de /recebimento/cobranca
  // (a CobrancaFila gerencia suas próprias tabs internas)
  const isCobranca = location.pathname.startsWith("/recebimento/cobranca");

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      {!isCobranca && (
        <>
          <CasaPageHeader
            breadcrumb={[
              { label: "Casa", to: "/" },
              { label: "SOPs" },
            ]}
            title="SOPs"
            subtitle="Pedidos de venda e parceiros comerciais"
          />

          <Tabs defaultValue="pedidos_venda" onValueChange={handleTabChange} className="space-y-4">
            <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
              <TabsTrigger
                value="pedidos_venda"
                className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
              >
                Pedidos de Venda
              </TabsTrigger>
              <TabsTrigger
                value="parceiros"
                className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
              >
                Parceiros Comerciais
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </>
      )}

      <div className={isCobranca ? "" : "mt-4"}>
        <Outlet />
      </div>
    </div>
  );
}
