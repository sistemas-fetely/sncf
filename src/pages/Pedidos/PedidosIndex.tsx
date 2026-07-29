import { useSearchParams } from "react-router-dom";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { EstagioPedido } from "@/types/pedido";

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;

  const handlePipelineClick = (estagio: EstagioPedido) => {
    const next = new URLSearchParams(searchParams);
    next.set("estagio", estagio);
    setSearchParams(next);
  };

  const handleLimparFiltro = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("estagio");
    setSearchParams(next);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Casa dos Pedidos</h1>
      </div>

      <Tabs defaultValue="fila" className="space-y-4">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="dash">Dash</TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="space-y-4">
          {/* Pipeline sticky */}
          <div className="sticky top-14 z-20 bg-background border-b border-border px-4 md:px-6 py-2">
            <PipelineHorizontal
              onClickEstagio={handlePipelineClick}
              onLimparFiltro={handleLimparFiltro}
              estagioAtivo={estagioParam}
            />
          </div>

          {/* Tabela */}
          <div>
            <FilaPedidosPorArea
              area="todas"
              estagios={estagioParam ? [estagioParam] : undefined}
              apenasAtivos={!estagioParam}
            />
          </div>
        </TabsContent>

        <TabsContent value="dash">
          <PainelDashPedidos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
