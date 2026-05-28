import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreditCard, QrCode, Receipt, Shield, Factory, Archive, LayoutGrid } from "lucide-react";
import { PedidosStatsCards } from "@/components/pedidos/PedidosStatsCards";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import type { EstagioPedido } from "@/types/pedido";

const TABS_VALIDAS = ["todas", "credito", "cartao", "pix", "boleto", "faturamento", "concluidos"];

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tabAtiva = tabParam && TABS_VALIDAS.includes(tabParam) ? tabParam : "todas";
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;

  const handleTabChange = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", v);
    next.delete("estagio");
    setSearchParams(next);
  };

  const handlePipelineClick = (estagio: EstagioPedido) => {
    const next = new URLSearchParams(searchParams);
    next.set("estagio", estagio);
    next.set("tab", "todas");
    setSearchParams(next);
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold">Casa dos Pedidos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portal único de pedidos B2B — recebimento, triagem, crédito, cobrança, exportação pro Bling.
        </p>
      </div>

      <PedidosStatsCards />

      <PipelineHorizontal
        onClickEstagio={handlePipelineClick}
        estagioAtivo={estagioParam}
      />

      <Tabs value={tabAtiva} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto justify-start">
          <TabsTrigger value="todas" className="gap-1.5">
            <LayoutGrid className="h-4 w-4" />
            Todos
          </TabsTrigger>
          <TabsTrigger value="credito" className="gap-1.5">
            <Shield className="h-4 w-4" />
            Crédito
          </TabsTrigger>
          <TabsTrigger value="cartao" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            Cartão
          </TabsTrigger>
          <TabsTrigger value="pix" className="gap-1.5">
            <QrCode className="h-4 w-4" />
            PIX
          </TabsTrigger>
          <TabsTrigger value="boleto" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            Boleto
          </TabsTrigger>
          <TabsTrigger value="faturamento" className="gap-1.5">
            <Factory className="h-4 w-4" />
            Faturamento
          </TabsTrigger>
          <TabsTrigger value="concluidos" className="gap-1.5">
            <Archive className="h-4 w-4" />
            Concluídos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="todas">
          <FilaPedidosPorArea
            area="todas"
            estagioInicial={estagioParam ?? "todos"}
            apenasAtivos={false}
          />
        </TabsContent>
        <TabsContent value="credito">
          <FilaPedidosPorArea area="todas" estagios={["em_analise_credito"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="cartao">
          <FilaPedidosPorArea area="todas" estagios={["em_cobranca_cartao"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="pix">
          <FilaPedidosPorArea area="todas" estagios={["em_cobranca_pix"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="boleto">
          <FilaPedidosPorArea area="todas" estagios={["em_cobranca_boleto"]} apenasAtivos />
        </TabsContent>
        <TabsContent value="faturamento">
          <FilaPedidosPorArea
            area="todas"
            estagios={["pronto_pro_bling", "em_separacao", "faturado", "em_transporte"]}
            apenasAtivos
          />
        </TabsContent>
        <TabsContent value="concluidos">
          <FilaPedidosPorArea
            area="todas"
            estagios={["entregue", "cancelado"]}
            apenasAtivos={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
