import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditoStatsCards } from "@/components/credito/CreditoStatsCards";
import { FilaPorEstagio } from "@/components/credito/FilaPorEstagio";
import { NovaAnaliseModalDialog } from "@/components/credito/NovaAnaliseModalDialog";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CasaPageHeader } from "@/components/casa/CasaPageHeader";

const TABS_VALIDAS = ["entrada", "analise", "decisao", "decididas"];

export default function CreditoIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab");
  const tabAtiva = tabParam && TABS_VALIDAS.includes(tabParam) ? tabParam : "entrada";

  const handleTabChange = (v: string) => {
    if (v === "cobranca") {
      navigate("/credito/cobranca");
      return;
    }
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
        subtitle="Pipeline B2B — Entrada (Mariana) → Análise (Time) → Decisão (Joseph)"
        actions={<NovaAnaliseModalDialog />}
      />

      <div className="space-y-6">
        <CreditoStatsCards />

        <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-4">
          <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start h-auto p-0 gap-6">
            <TabsTrigger
              value="entrada"
              className="rounded-none border-b-2 border-transparent bg-transparent px-1 pb-3 pt-1 text-muted-foreground data-[state=active]:text-gold data-[state=active]:border-gold data-[state=active]:shadow-none data-[state=active]:bg-transparent"
            >
              Entrada
            </TabsTrigger>
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
          <TabsContent value="entrada"><FilaPorEstagio estagio="entrada" /></TabsContent>
          <TabsContent value="analise"><FilaPorEstagio estagio="analise" /></TabsContent>
          <TabsContent value="decisao"><FilaPorEstagio estagio="decisao" /></TabsContent>
          <TabsContent value="decididas"><FilaPorEstagio estagio="decididas" /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
