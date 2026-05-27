import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditoStatsCards } from "@/components/credito/CreditoStatsCards";
import { FilaPorEstagio } from "@/components/credito/FilaPorEstagio";
import { NovaAnaliseModalDialog } from "@/components/credito/NovaAnaliseModalDialog";

export default function CreditoIndex() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Análise de Crédito</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline de aprovação de pedidos B2B — Entrada (Mariana) → Análise (Time) → Decisão (Joseph)
          </p>
        </div>
        <NovaAnaliseModalDialog />
      </div>

      <CreditoStatsCards />

      <Tabs defaultValue="entrada" className="space-y-4">
        <TabsList>
          <TabsTrigger value="entrada">Entrada</TabsTrigger>
          <TabsTrigger value="analise">Análise</TabsTrigger>
          <TabsTrigger value="decisao">Decisão</TabsTrigger>
          <TabsTrigger value="decididas">Decididas</TabsTrigger>
        </TabsList>
        <TabsContent value="entrada"><FilaPorEstagio estagio="entrada" /></TabsContent>
        <TabsContent value="analise"><FilaPorEstagio estagio="analise" /></TabsContent>
        <TabsContent value="decisao"><FilaPorEstagio estagio="decisao" /></TabsContent>
        <TabsContent value="decididas"><FilaPorEstagio estagio="decididas" /></TabsContent>
      </Tabs>
    </div>
  );
}
