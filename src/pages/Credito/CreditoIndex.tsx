import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditoStatsCards } from "@/components/credito/CreditoStatsCards";
import { FilaPorEstagio } from "@/components/credito/FilaPorEstagio";
import { NovaAnaliseModalDialog } from "@/components/credito/NovaAnaliseModalDialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";
import { Button } from "@/components/ui/button";
import { Settings2, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const TABS_VALIDAS = ["analise", "decisao", "decididas"];

export default function CreditoIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { roles } = useAuth();
  const isAdmin = roles?.some((r) => ["super_admin", "admin_rh"].includes(r));
  const tabParam = searchParams.get("tab");
  const tabAtiva = tabParam && TABS_VALIDAS.includes(tabParam) ? tabParam : "analise";

  const handleTabChange = (v: string) => {
    setSearchParams({ tab: v });
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 animate-casa-fade-in">
      <CasaPageHeader
        breadcrumb={[
          { label: "Casa", to: "/" },
          { label: "Crédito" },
        ]}
        title="Análise de Crédito"
        subtitle="Pipeline B2B — Análise (Time) → Decisão (Joseph)"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/credito/clientes")}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Clientes
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/credito/regras-cadencia")}
                className="gap-2"
                title="Regras de cadência (admin)"
              >
                <Settings2 className="h-4 w-4" />
                Regras
              </Button>
            )}
            <NovaAnaliseModalDialog />
          </div>
        }
      />


      <div className="space-y-6">
        <CreditoStatsCards />

        <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
            <TabsTrigger
              value="analise"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              Análise
            </TabsTrigger>
            <TabsTrigger
              value="decisao"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              Decisão
            </TabsTrigger>
            <TabsTrigger
              value="decididas"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              Decididas
            </TabsTrigger>
          </TabsList>
          <TabsContent value="analise"><FilaPorEstagio estagio="analise" /></TabsContent>
          <TabsContent value="decisao"><FilaPorEstagio estagio="decisao" /></TabsContent>
          <TabsContent value="decididas"><FilaPorEstagio estagio="decididas" /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
