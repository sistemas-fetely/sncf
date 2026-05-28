import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PedidosStatsCards } from "@/components/pedidos/PedidosStatsCards";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import type { EstagioPedido } from "@/types/pedido";

const TABS_VALIDAS = ["todas", "sops", "credito", "bling", "concluidos"];

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
        <TabsList>
          <TabsTrigger value="todas">Todos</TabsTrigger>
          <TabsTrigger value="sops">Em SOps</TabsTrigger>
          <TabsTrigger value="credito">Em Crédito</TabsTrigger>
          <TabsTrigger value="bling">Em Bling</TabsTrigger>
          <TabsTrigger value="concluidos">Concluídos</TabsTrigger>
        </TabsList>

        <TabsContent value="todas">
          <FilaPedidosPorArea
            area="todas"
            estagioInicial={estagioParam ?? "todos"}
            apenasAtivos={false}
          />
        </TabsContent>
        <TabsContent value="sops">
          <FilaPedidosPorArea area="sops" apenasAtivos />
        </TabsContent>
        <TabsContent value="credito">
          <FilaPedidosPorArea area="credito" apenasAtivos />
        </TabsContent>
        <TabsContent value="bling">
          <FilaPedidosPorArea area="bling" apenasAtivos />
        </TabsContent>
        <TabsContent value="concluidos">
          <FilaPedidosPorArea area="todas" apenasAtivos={false} estagioInicial="entregue" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
