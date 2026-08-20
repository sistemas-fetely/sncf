import { Suspense, lazy, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PipelineHorizontal } from "@/components/pedidos/PipelineHorizontal";
import { FilaPedidosPorArea } from "@/components/pedidos/FilaPedidosPorArea";
import { PainelDashPedidos } from "@/components/pedidos/PainelDashPedidos";
import { ExportarPedidosButton } from "@/components/pedidos/ExportarPedidosButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePedidosPipeline } from "@/hooks/pedidos/usePedidosPipeline";
import { ESTAGIOS_DESVIO, type EstagioPedido } from "@/types/pedido";

import { PageShell } from "@/components/layout/PageShell";

// Telas pesadas: só entram no bundle quando a aba é aberta.
const Oportunidades = lazy(() => import("@/pages/Comercial/Oportunidades"));
const Consignados = lazy(() => import("@/pages/Comercial/Consignados"));

const ABAS = ["fila", "dash", "recuperacao", "consignados"] as const;
type Aba = (typeof ABAS)[number];

export default function PedidosIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const estagioParam = searchParams.get("estagio") as EstagioPedido | null;
  const abaParam = searchParams.get("aba");
  const aba: Aba = ABAS.includes(abaParam as Aba) ? (abaParam as Aba) : "fila";
  const [incluirCancelados, setIncluirCancelados] = useState(false);
  const [riscoAltoAtivo, setRiscoAltoAtivo] = useState(false);

  // Reaproveita o cache do pipeline: a contagem de desvio já está lá.
  const { data: pipeline } = usePedidosPipeline();
  const qtdRecuperacao = useMemo(() => {
    let qtd = 0;
    (pipeline || []).forEach((row) => {
      const ehDesvio =
        row.eh_desvio != null
          ? !!row.eh_desvio
          : ESTAGIOS_DESVIO.includes(row.estagio);
      if (ehDesvio) qtd += Number(row.qtd || 0);
    });
    return qtd;
  }, [pipeline]);

  const setAba = (valor: string) => {
    // Trocar de aba preserva os outros params (ex.: ?estagio= aplicado na Fila).
    const next = new URLSearchParams(searchParams);
    if (valor === "fila") next.delete("aba");
    else next.set("aba", valor);
    setSearchParams(next);
  };

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
    <PageShell>
      {/* Header */}
      <div className="flex flex-row items-center justify-between">
        <h1 className="text-2xl font-medium">Casa dos Pedidos</h1>
        <ExportarPedidosButton />
      </div>

      <Tabs value={aba} onValueChange={setAba} className="space-y-4">
        <TabsList>
          <TabsTrigger value="fila">Fila</TabsTrigger>
          <TabsTrigger value="dash">Dash</TabsTrigger>
          {/* Separador: à esquerda, duas leituras da carteira ativa;
              à direita, salas separadas. */}
          <div className="w-px bg-border mx-1.5 self-stretch" aria-hidden />
          <TabsTrigger value="recuperacao">
            Recuperação{qtdRecuperacao > 0 ? ` (${qtdRecuperacao})` : ""}
          </TabsTrigger>
          <TabsTrigger value="consignados">Consignados</TabsTrigger>
        </TabsList>

        <TabsContent value="fila" className="space-y-4">
          {/* Pipeline sticky */}
          <div className="sticky top-14 z-20 bg-background border-b border-border px-4 md:px-6 py-2">
            <PipelineHorizontal
              onClickEstagio={handlePipelineClick}
              onLimparFiltro={handleLimparFiltro}
              estagioAtivo={estagioParam}
              incluirCancelados={incluirCancelados}
              onToggleCancelados={setIncluirCancelados}
              riscoAltoAtivo={riscoAltoAtivo}
              onToggleRiscoAlto={() => setRiscoAltoAtivo((v) => !v)}
              onAbrirRecuperacao={() => setAba("recuperacao")}
            />
          </div>

          {/* Tabela */}
          <div>
            <FilaPedidosPorArea
              area="todas"
              estagios={estagioParam ? [estagioParam] : undefined}
              apenasAtivos={!estagioParam}
              incluirCancelados={incluirCancelados}
              somenteRiscoAlto={riscoAltoAtivo}
            />
          </div>
        </TabsContent>

        <TabsContent value="dash">
          <PainelDashPedidos />
        </TabsContent>

        <TabsContent value="recuperacao">
          <Suspense fallback={<CarregandoAba />}>
            <Oportunidades embutido />
          </Suspense>
        </TabsContent>

        <TabsContent value="consignados">
          <Suspense fallback={<CarregandoAba />}>
            <Consignados embutido />
          </Suspense>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CarregandoAba() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
