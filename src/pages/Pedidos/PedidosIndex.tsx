import { useSearchParams } from "react-router-dom";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
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
        <p className="text-sm text-muted-foreground">
          Portal único de pedidos B2B — recebimento, triagem, crédito, cobrança, faturamento.
        </p>
      </div>

      {/* Pipeline sticky */}
      <div className="sticky top-0 z-10 bg-background py-2">
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
    </div>
  );
}
